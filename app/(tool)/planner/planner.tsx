'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
// Leaflet touches window on import, so the map is only pulled in on the
// client and only when the Route tab is actually opened.
const RouteMap = dynamic(()=>import('./map'), { ssr: false, loading: ()=><div className="map skeleton" /> });
// Type only, so it does not drag Leaflet into the first load the way a
// value import from the same module would.
import type { LayerKey, Pump } from './map';
import { aud, defaults, fullTankRange, type PlanInputs, type Period, fuelCost, monthlyBudget, weeklyBudget, kmPerPeriod, routeTotals, nationalParkNight, nightlyFor, type Leg, convertBudget, WEEKS_PER_MONTH, runwayMonths, moneyAfter, fuelPlan, tankRange, budgetTotal } from '@/lib/planner';
import { credit, type SharedPlace } from '@/lib/myplaces';
import Install from './install';
import Splash from './splash';
import Offline from './offline';

type Tab = 'Explore' | 'Legs' | 'Money';

// The three marks on the bottom bar. Strokes in the current colour, so the
// active one lights up by inheriting and there is no second set of files.
function TabMark({ name }: { name: string }) {
  const a = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
              strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
      {name === 'Explore' && <>
        <circle cx="11" cy="11" r="7.2" {...a} /><path d="M20 20l-3.7-3.7" {...a} />
      </>}
      {name === 'Legs' && <>
        {/* A road bending away, which is what a run of legs actually is. */}
        <path d="M8 21c0-6 8-8 8-14" {...a} />
        <circle cx="8" cy="21" r="1.6" {...a} /><circle cx="16" cy="7" r="1.6" {...a} />
        <path d="M12.4 14.4h.02" {...a} />
      </>}
      {name === 'Money' && <>
        <rect x="2.6" y="6" width="18.8" height="12" rx="2.4" {...a} />
        <circle cx="12" cy="12" r="2.6" {...a} />
      </>}
      {name === 'Van' && <>
        {/* A van in profile: body, window, and the two wheels under it. */}
        <path d="M2.8 15.4V9.2a1.6 1.6 0 0 1 1.6-1.6h9.4l4.6 3.4h1.2a1.6 1.6 0 0 1 1.6 1.6v2.8" {...a} />
        <path d="M2.8 15.4h2.1M9.3 15.4h5.4M19 15.4h2.2" {...a} />
        <circle cx="7.1" cy="16.6" r="1.9" {...a} />
        <circle cx="16.9" cy="16.6" r="1.9" {...a} />
      </>}
    </svg>
  );
}

function Card({ title, children, className = '', id }: { title?: string; children: React.ReactNode; className?: string; id?: string }) { return <section id={id} className={`card ${className}`}>{title && <h2>{title}</h2>}{children}</section>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong></div>; }
function MiniChart({ data, dataKey = 'cash', color = '#3ee6b2' }: { data: Record<string,number>[]; dataKey?: string; color?: string }) { const values = data.map(x => x[dataKey]); const max = Math.max(...values, 1), min = Math.min(...values, 0), range = Math.max(max-min, 1); const points = values.map((v,i) => `${i/(values.length-1)*100},${100-(v-min)/range*92-4}`).join(' '); return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart"><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>; }
function Field({ label, value, onChange, prefix = '$', step = 100, min = 0, hint = '' }: { label: string; value: number; onChange: (v:number)=>void; prefix?: string; step?: number; min?: number; hint?: string }) {
  // Empty means empty.
  //
  // A field sitting on 0 has to be cleared before it can be typed into, and
  // clearing a number input on a phone is a tap to focus, a tap to select and a
  // tap to delete before you have entered anything at all. So nothing is shown
  // until there is something to show, and the box keeps its own text while it
  // is being edited so a half typed number is not snapped to something else
  // underneath your thumb.
  const [text, setText] = useState(value ? String(value) : '');
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(value ? String(value) : ''); }, [value, editing]);
  return <label className="field"><span>{label}</span><div><i>{prefix}</i>
    <input aria-label={label} type="number" inputMode="decimal" min={min} step={step}
      placeholder={hint} value={text}
      onFocus={()=>setEditing(true)} onBlur={()=>setEditing(false)}
      onChange={e=>{
        const typed = e.target.value;
        setText(typed);
        const n = Number(typed);
        onChange(typed === '' || !Number.isFinite(n) ? 0 : Math.max(min, n));
      }} />
  </div></label>;
}
// How long, in words.
//
// A five week trip described as "1.2 months" is a number nobody thinks in.
// Short plans read in weeks, long ones in months, and the switch happens where
// people's own language does.
function saySpan(months: number) {
  if (months < 3) {
    const weeks = Math.round(months * WEEKS_PER_MONTH);
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  const rounded = Math.round(months * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} months`;
}

export default function Planner() {
  const [p, setP] = useState<PlanInputs>(defaults);
  const [tab,setTab] = useState<Tab>('Explore');
  const [dark,setDark]=useState(true);
  const [saved,setSaved] = useState<{name:string;data:PlanInputs}[]>([]);
  useEffect(()=>{ const item=localStorage.getItem('trip-planner-scenarios'); if(item) try{setSaved(JSON.parse(item));}catch{} },[]);

  // The plan you are in the middle of, kept without being asked.
  //
  // Save plan is for keeping named versions to compare. This is different: it
  // is the working copy, and losing it is the difference between a tool and a
  // toy. A phone evicts a background tab whenever it feels like it, and the
  // place this gets used is a car park with one bar, not a desk.
  //
  // Merged over the defaults on the way back in, so a plan saved before a field
  // existed — a tank size, say — comes back with a sensible value in it rather
  // than an empty one that quietly makes the range NaN.
  const [restored,setRestored]=useState(false);
  useEffect(()=>{
    try{
      const raw=localStorage.getItem('trip-planner-current');
      if(raw){
        const was=JSON.parse(raw);
        setP({...defaults,...was,budget:{...defaults.budget,...(was.budget??{})}});
        if(typeof was.duration==='number'){
          const months=was.duration;
          if(months<3){ setSpanUnit('weeks'); setSpanText(String(Math.round(months*WEEKS_PER_MONTH))); }
          else { setSpanUnit('months'); setSpanText(String(Math.round(months*10)/10)); }
        }
      }
    }catch{}
    setRestored(true);
  },[]);

  useEffect(()=>{
    // Nothing is written until the restore has run, or the first render would
    // save the defaults straight over whatever was there.
    if(!restored) return;
    const t=setTimeout(()=>{
      try{
        let body=JSON.stringify(p);
        // Route geometry is the only thing here big enough to fill the quota.
        // If it ever does, the numbers matter more than the drawn line.
        if(body.length>1_500_000){
          body=JSON.stringify({...p,legs:(p.legs??[]).map(({line,...rest})=>rest)});
        }
        localStorage.setItem('trip-planner-current',body);
      }catch{}
    },400);
    return ()=>clearTimeout(t);
  },[p,restored]);
  const update=(key: keyof PlanInputs, value: unknown)=>setP(x=>({...x,[key]:value}));
  const [busy,setBusy]=useState<string|null>(null);
  const route=routeTotals(p);
  const [around,setAround]=useState<Record<string,any>>({});
  const [picking,setPicking]=useState<{legId:string;end:'from'|'to'}|null>(null);
  // How far out to look when somebody taps a town. Twenty five kilometres is
  // about what you would drive after tea; further than that is a day out.
  const [radius,setRadius]=useState(25);
  // The typed duration is kept as text so a half finished number does not snap
  // the plan to something silly while it is being typed.
  const [spanUnit,setSpanUnit]=useState<'weeks'|'months'>('months');
  const [spanText,setSpanText]=useState('12');
  // Open while there is nothing in it, so the first visit is an invitation to
  // fill it rather than a button hiding the work.
  const [lines,setLines]=useState(true);
  // Which kinds are drawn, and how many of them are inside the frame. Both live
  // here rather than in the map so the count can be shown under it.
  const [show,setShow]=useState<Record<LayerKey,boolean>>({
    // Parks on by default: "where can I stay" is the question somebody opens a
    // trip planner with. Fuel on too, because it is the other one.
    caravan:true, camps:true, fuel:true, water:true, dump:true, things:true, shared:true,
  });
  const [inView,setInView]=useState<{total:number;corridorTotal:number}&Record<LayerKey,number>>(
    {total:0,corridorTotal:0,caravan:0,camps:0,fuel:0,water:0,dump:0,things:0,shared:0});
  const [flyTo,setFlyTo]=useState<{lat:number;lng:number;at:number}|null>(null);
  // Once there is a road, everything off it is noise. On by default the moment
  // a route exists, because that is the point at which somebody has told the
  // app where they are going.
  const [onlyRoute,setOnlyRoute]=useState(true);
  const [corridor,setCorridor]=useState(25);
  const [noHit,setNoHit]=useState(false);
  // The count strip sits outside the map wrapper, so a sheet drawn inside that
  // wrapper cannot cover it and it shows through along the bottom edge. It gets
  // out of the way instead.
  const [sheetOpen,setSheetOpen]=useState(false);
  // Covered until the tiles have painted. The safety timer matters more than
  // the happy path: on a bad connection the tile load event may never come, and
  // a splash nobody can get past is worse than a map that arrives in pieces.
  const [painted,setPainted]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setPainted(true), 4500); return ()=>clearTimeout(t); },[]);
  const toggleLayer=useCallback((key:LayerKey)=>setShow(v=>({...v,[key]:!v[key]})),[]);
  // Search moves the map and then asks what is around where it landed, which is
  // the thing somebody wanted when they typed a town in.
  const searchFor=useCallback(async (q:string)=>{
    const query=q.trim();
    if(query.length<2) return;
    setNoHit(false);
    try{
      const res=await fetch(`/api/find?q=${encodeURIComponent(query)}`);
      const body=await res.json().catch(()=>({}));
      const hit=body?.hits?.[0];
      if(!hit){ setNoHit(true); return; }
      setFlyTo({lat:hit.lat,lng:hit.lng,at:Date.now()});
    }catch{ setNoHit(true); }
  },[]);

  const updateLeg=useCallback((id:string,patch:Partial<Leg>)=>setP(v=>({...v,legs:(v.legs??[]).map(l=>l.id===id?{...l,...patch}:l)})),[]);

  // Pointing at the map beats typing a town name, because half the places you
  // stop do not have one. First tap sets the start, second sets the finish, and
  // then it routes without being asked.
  const onPick=useCallback(async(point:[number,number])=>{
    if(!picking) return;
    const leg=(p.legs??[]).find(l=>l.id===picking.legId);
    if(!leg) { setPicking(null); return; }
    if(picking.end==='from'){
      updateLeg(leg.id,{fromAt:point,from:'',note:'Now tap where this leg finishes.'});
      setPicking({legId:leg.id,end:'to'});
      return;
    }
    updateLeg(leg.id,{toAt:point,to:''});
    setPicking(null);
    setBusy(leg.id);
    try{
      const res=await fetch('/api/leg',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({from:'',to:'',fromAt:leg.fromAt,toAt:point})});
      const d=await res.json();
      if(!res.ok){updateLeg(leg.id,{note:d.error||'Could not route between those two points.'});return;}
      updateLeg(leg.id,{km:d.km,from:d.from,to:d.to,fromAt:d.fromAt,toAt:d.toAt,line:d.line,
        note:`${d.from} to ${d.to}, about ${d.hours} hours towing.`});
    }catch{
      updateLeg(leg.id,{note:'Could not reach the map.'});
    }finally{setBusy(null);}
  },[picking,p.legs,updateLeg]);

  // Tap a town, find out whether it is worth stopping in.
  //
  // The whole point of a lap is the places, and a planner that only knows what
  // a night costs tells you nothing about whether you want to be there. This
  // answers the question the kids ask from the back seat.
  const [town,setTown]=useState<{key:string;name:string;busy:boolean;error?:string}|null>(null);
  // Every servo the map can currently see, handed up by the map itself.
  //
  // Diesel used to arrive behind a tap: you tapped a town, that fired its own
  // lookup, and the price landed in a panel. The map has swept the whole view
  // for board prices on every pan for a while now, so the tap was asking for
  // numbers that were already on the screen, and the Money tab was still
  // telling people to go and tap something before it would price a trip.
  // This is that sweep. Nothing here needs a tap.
  const [areaPumps,setAreaPumps]=useState<Pump[]>([]);
  // The two numbers anybody asks a board for: the best price in front of them,
  // and what it costs on average if they fill where it is convenient.
  const areaDiesel=useMemo(()=>{
    if(!areaPumps.length) return null;
    const cheapest=areaPumps.reduce((best,pump)=>pump.price<best.price?pump:best);
    const average=areaPumps.reduce((sum,pump)=>sum+pump.price,0)/areaPumps.length;
    return { count:areaPumps.length, cheapest, average };
  },[areaPumps]);
  // Places travellers have added, shared.
  //
  // Fetched per stop rather than all at once, because the whole table is a map
  // of Australia covered in dots and you only ever care about the town in front
  // of you. Kept by point, so tapping back to a stop already opened does not
  // ask again.
  const [shared,setShared]=useState<Record<string,SharedPlace[]>>({});
  // Prices at the towns you fill in.
  //
  // Kept apart from the 250km sweep behind a map tap: filling up is a question
  // about one town, not a district, so it asks a much tighter radius and gets
  // the servo you would actually pull into.
  const [fillPrices,setFillPrices]=useState<Record<string,any>>({});
  const priceTown=useCallback(async(at:[number,number])=>{
    const key=`${at[0].toFixed(2)},${at[1].toFixed(2)}`;
    setFillPrices(v=>v[key]?v:{...v,[key]:{busy:true}});
    try{
      const res=await fetch('/api/fuel',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({at,radius:30})});
      const d=await res.json();
      setFillPrices(v=>({...v,[key]:d}));
    }catch{
      setFillPrices(v=>({...v,[key]:{error:true}}));
    }
  },[]);

  const loadShared=useCallback(async(key:string,at:[number,number],within:number)=>{
    try{
      const res=await fetch(`/api/places?lat=${at[0]}&lng=${at[1]}&radius=${within}`);
      const d=await res.json();
      if(res.ok) setShared(v=>({...v,[key]:d.places??[]}));
    }catch{}
  },[]);


  // Price every leg off the road it actually runs down.
  //
  // Runs after the distance lookup, because it needs the line. The median is
  // used rather than the average: one servo at $2.96 on a highway where
  // everything else is $2.45 should not drag a whole leg's budget up, and one
  // at $1.79 should not drag it down. The middle of the board is what you will
  // pay if you fill where it is convenient, which is what people actually do.
  const priced = useRef<Set<string>>(new Set());
  useEffect(() => {
    const legs = p.legs ?? [];
    const next = legs.find((l) => (l.line?.length ?? 0) > 1 && !priced.current.has(l.id + (l.line?.length ?? 0)));
    if (!next?.line) return;
    const key = next.id + next.line.length;
    priced.current.add(key);

    // Deliberately not cancelled when the effect re-runs.
    //
    // It was, and that made the whole feature impossible. The leg is marked as
    // priced before the request goes out, so it is only asked once. But the
    // distance lookup keeps updating legs while this is in flight, every update
    // changes p.legs, and a cleanup that set a live flag to false threw the
    // answer away the moment it arrived. The leg was already flagged as done,
    // so nothing ever asked again and no price ever appeared.
    //
    // There is nothing to cancel here anyway: the result is one leg's price
    // keyed by that leg's id, so a late answer is still the right answer.
    fetch('/api/fuel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ line: next.line, within: 25 }),
    })
      .then((r) => r.json())
      .then((body) => {
        const prices = (body?.pumps ?? []).map((x: {price: number}) => x.price).sort((a: number, b: number) => a - b);
        if (!prices.length) return;
        const mid = prices[Math.floor(prices.length / 2)];
        updateLeg(next.id, { boardPrice: Number(mid.toFixed(3)), boardCount: prices.length });
      })
      .catch(() => {
        // Let it be asked again next time round rather than leaving the leg
        // permanently marked as done on a dropped connection.
        priced.current.delete(key);
      });
  }, [p.legs, updateLeg]);


  // The long stretches with no fuel on this road.
  //
  // Asked for whenever the road or the tank changes. This is the only number on
  // here that can leave somebody stranded rather than merely out of pocket, so
  // it is worked out from whether a servo exists rather than whether it reports
  // a price, and the range it is compared against has the reserve taken off.
  const [gaps,setGaps]=useState<{range:number;tankRange:number;servos:number;priced:number;longest:number;totalKm:number;gaps:{km:number;from:string;to:string;atKm:number;over:number;lastPrice:number|null}[]}|null>(null);
  useEffect(()=>{
    const road=(p.legs??[]).flatMap(l=>l.line??[]);
    if(road.length<2||!p.tankLitres||!p.towingConsumption){ setGaps(null); return; }
    let live=true;
    const t=setTimeout(()=>{
      fetch('/api/gaps',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({line:road,tankLitres:p.tankLitres,consumption:p.towingConsumption,reserve:p.fuelReserve??0.1,detour:10})})
        .then(r=>r.json()).then(b=>{ if(live) setGaps(b); }).catch(()=>{});
    },700);
    return ()=>{ live=false; clearTimeout(t); };
  },[p.legs,p.tankLitres,p.towingConsumption,p.fuelReserve]);

  const onTown=useCallback(async(at:[number,number],name?:string)=>{
    const key=`${at[0].toFixed(3)},${at[1].toFixed(3)}`;
    setTown({key,name:name||'',busy:true});
    // No diesel lookup here any more. It used to fire alongside this one, which
    // made a tap the way you got a fuel price. The map sweeps the whole view
    // for board prices without being asked, so this asks for the things a
    // sweep cannot give you: what there is to do, and what travellers added.
    // What other travellers have added here, on its own trip so a slow map
    // lookup does not hold up the list people wrote themselves.
    loadShared(key,at,radius);
    try{
      const res=await fetch('/api/nearby',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({at,radius})});
      const d=await res.json();
      if(!res.ok){setTown({key,name:name||'',busy:false,error:d.error||'Nothing mapped around there.'});return;}
      setAround(v=>({...v,[key]:d}));
      setTown({key,name:name||d.at||'that spot',busy:false});
    }catch{
      setTown({key,name:name||'',busy:false,error:'Could not reach the map.'});
    }
  },[radius,loadShared]);

  // Your own price book.
  //
  // OpenStreetMap has a price on about one camp in twelve, and WikiCamps and
  // Hipcamp will not give theirs up. So the prices that matter are the ones you
  // have actually paid: type a rate against a place once and it is remembered,
  // and every trip after that it fills itself in.
  const [prices,setPrices]=useState<Record<string,number>>({});
  useEffect(()=>{ try{ const raw=localStorage.getItem('trip-planner-prices'); if(raw) setPrices(JSON.parse(raw)); }catch{} },[]);
  const rememberPrice=(place:string,nightly:number)=>{
    const key=place.trim().toLowerCase();
    if(!key||!nightly) return;
    setPrices(v=>{ const next={...v,[key]:nightly}; try{localStorage.setItem('trip-planner-prices',JSON.stringify(next));}catch{} return next; });
  };
  const knownPrice=(place:string)=>prices[(place||'').trim().toLowerCase()];

  const [adding,setAdding]=useState<'camp'|'thing'|null>(null);
  const [saving,setSaving]=useState(false);
  const [addError,setAddError]=useState<string|null>(null);
  const [draft,setDraft]=useState({name:'',nightly:'',what:'',note:'',addedBy:''});
  // Whoever is on this phone, remembered so it does not have to be typed for
  // every camp. It is a first name on a public list, not a login.
  useEffect(()=>{ try{ const who=localStorage.getItem('trip-planner-who'); if(who) setDraft(d=>({...d,addedBy:who})); }catch{} },[]);

  // Looked up one leg at a time, on purpose. The map data is free and run on
  // donated servers, and firing off a dozen requests because somebody pasted an
  // itinerary is how that stops being free.
  const lookup=useCallback(async(leg:Leg)=>{
    if(!leg.from.trim()||!leg.to.trim()){updateLeg(leg.id,{note:'Put both ends in first.'});return;}
    setBusy(leg.id);
    try{
      const res=await fetch('/api/leg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:leg.from,to:leg.to})});
      const d=await res.json();
      if(!res.ok){updateLeg(leg.id,{note:d.error||'Could not work that one out. Type the distance in.'});return;}
      updateLeg(leg.id,{km:d.km,fromAt:d.fromAt,toAt:d.toAt,line:d.line,
        note:`${d.from} to ${d.to}, about ${d.hours} hours towing.`});
    }catch{
      updateLeg(leg.id,{note:'Could not reach the map. Type the distance in.'});
    }finally{setBusy(null);}
  },[updateLeg]);

  // Work the distance out without being asked.
  //
  // It was a button, and a button that has to be pressed after typing two town
  // names is a button that exists because the code wanted it, not the person.
  // Both ends filled in is the whole instruction.
  //
  // The wait before it fires is the important part. Somebody typing "Rockhamp"
  // has not finished, and geocoding every keystroke would hammer a donated
  // server and return the wrong town on the way past. So it waits for the
  // typing to stop, then goes once per leg, and never for a leg it has already
  // worked out.
  const done=useRef<Set<string>>(new Set());
  useEffect(()=>{
    const legs=p.legs??[];
    const next=legs.find(l=>{
      const key=`${l.id}:${l.from.trim().toLowerCase()}>${l.to.trim().toLowerCase()}`;
      return l.from.trim().length>2 && l.to.trim().length>2 && !done.current.has(key);
    });
    if(!next||busy) return;
    const key=`${next.id}:${next.from.trim().toLowerCase()}>${next.to.trim().toLowerCase()}`;
    const t=setTimeout(()=>{ done.current.add(key); lookup(next); }, 900);
    return ()=>clearTimeout(t);
  },[p.legs,busy,lookup]);

  // A five week trip charted month by month is four dots and a cliff. So the
  // chart steps in weeks for anything under six months and months above it,
  // and runs half again past the end so you can see where it lands.
  const step=p.duration<6?'week':'month';
  const stepMonths=step==='week'?1/WEEKS_PER_MONTH:1;
  const projection=useMemo(()=>{
    const count=Math.min(60,Math.max(8,Math.ceil(p.duration/stepMonths*1.5)));
    return Array.from({length:count},(_,i)=>({
      month:i+1, cash:moneyAfter(p,(i+1)*stepMonths), spent:monthlyBudget(p)*(i+1)*stepMonths,
    }));
  },[p,stepMonths]);
  const burn=monthlyBudget(p);
  const runway=runwayMonths(p);
  const save=()=>{const name=`Plan ${saved.length+1}`;const next=[...saved,{name,data:p}];setSaved(next);localStorage.setItem('trip-planner-scenarios',JSON.stringify(next));};
  const csv=()=>{const content=['month,money left,spent so far',...projection.map(r=>[r.month,Math.round(r.cash),Math.round(r.spent)].join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv'}));a.download='trip-plan.csv';a.click();URL.revokeObjectURL(a.href);};
  const afterMonths=(m:number)=>moneyAfter(p,m);
  const status=runway>=p.duration?'green':runway>=p.duration*0.75?'amber':'red';
  // Where the tank runs out, given the legs as they stand.
  const plan=useMemo(()=>fuelPlan(p),[p]);
  // Only the towns in that plan get priced, and only once each. Pricing every
  // leg end would be a dozen requests for stops you drive straight through.
  useEffect(()=>{
    for(const stop of plan.stops.slice(0,8)){
      if(!stop.atPoint) continue;
      const key=`${stop.atPoint[0].toFixed(2)},${stop.atPoint[1].toFixed(2)}`;
      if(!fillPrices[key]) priceTown(stop.atPoint);
    }
  },[plan.stops,fillPrices,priceTown]);
  const fillAt=(at?:[number,number])=>at?fillPrices[`${at[0].toFixed(2)},${at[1].toFixed(2)}`]:null;

  const found=town&&around[town.key]?around[town.key]:null;
  // Where a new place lands: the town the lookup settled on, or failing that
  // the raw point that was tapped.
  const atPoint:[number,number]|null=town
    ?((found?.atPoint as [number,number]|undefined)??(town.key.split(',').map(Number) as [number,number]))
    :null;
  const here=town?(shared[town.key]??[]):[];
  const sharedCamps=here.filter(x=>x.kind==='camp');
  const sharedThings=here.filter(x=>x.kind==='thing');

  const addPlace=async()=>{
    const name=draft.name.trim();
    if(!name||!atPoint||!adding||!town) return;
    setSaving(true); setAddError(null);
    try{
      const res=await fetch('/api/places',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind:adding,name,lat:atPoint[0],lng:atPoint[1],
          nightly:adding==='camp'?draft.nightly:null,what:draft.what,note:draft.note,addedBy:draft.addedBy})});
      const d=await res.json();
      if(!res.ok){ setAddError(d.error||'Could not add that one.'); return; }
      setShared(v=>({...v,[town.key]:[...(v[town.key]??[]),d.place]}));
      // A camp with a price on it belongs in your own price book too, so a leg
      // typed to that name fills its rate in later without asking.
      if(d.place.kind==='camp'&&d.place.nightly) rememberPrice(name,Number(d.place.nightly));
      try{ if(draft.addedBy.trim()) localStorage.setItem('trip-planner-who',draft.addedBy.trim()); }catch{}
      setAdding(null); setDraft(v=>({name:'',nightly:'',what:'',note:'',addedBy:v.addedBy}));
    }catch{
      setAddError('Could not reach the list.');
    }finally{ setSaving(false); }
  };

  return <div className={`planner${dark?' dark':''}${tab==='Explore'?' explore':''}`}>
    {/* No title here. The page around it carries the heading, because that is
        the one a search engine reads and two of them on a screen is one too
        many. What is left is the row of things you actually press. */}
    {/* The tabs moved to the bottom of the screen, where a thumb is.
        Splitting the map away from the legs is the other half of it: the map
        had the legs list underneath it and so could never have the screen,
        which is the whole reason it read worse than it should have. */}
    <Splash going={painted}/>

    <nav className="tabbar four">
      {([['Explore','Explore'],['Legs','The run'],['Money','Money']] as [Tab,string][]).map(([id,label])=>(
        <button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)} aria-current={tab===id?'page':undefined}>
        <TabMark name={id}/>
        <span>{label}</span>
        </button>
      ))}
      {/* The other half of the tool, and the only way to reach it on a phone.
          It was linked from the header first, which is true on a desktop and
          useless on a mobile: the map takes the whole screen and the header is
          never seen. A link nobody can see is not a link. */}
      <a className="jumpout" href="/van">
        <TabMark name="Van"/>
        <span>Your van</span>
      </a>
    </nav>
    <header className="top embedded">
      <div className="actions"><button onClick={()=>setDark(!dark)}>{dark?'☀ Light':'☾ Dark'}</button><button onClick={()=>{setP(defaults);setSpanUnit('months');setSpanText('12');try{localStorage.removeItem('trip-planner-current');}catch{}}}>Reset defaults</button><button onClick={save}>Save plan</button><button onClick={csv}>Export CSV</button><button className="primary" onClick={()=>window.print()}>Print / PDF</button></div>
    </header>
    {/* The tabs stay put, and the Money tab gets a second row to jump with.
        It is a long page by nature — a household budget is a long list — so
        the answer is not to cut it down but to stop making people scroll
        through the whole thing to change one number. */}
    <div className="toolstrip">
      {tab==='Money' && <div className="jump">
        {([['fuel','Fuel'],['start','Money in'],['spend','Everything else'],['chart','How long'],['saved','Saved']] as const).map(([id,label])=>
          <button key={id} onClick={()=>document.getElementById(`sec-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'})}>{label}</button>)}
      </div>}
    </div>
    <Install />
    <main>
      {tab==='Explore' && <>
        <Card className="map-card">
          <RouteMap legs={p.legs??[]} around={around} shared={shared} picking={picking}
                    onPick={onPick} onTown={onTown}
                    show={show} onToggle={toggleLayer} onCount={setInView}
                    onSearch={searchFor} flyTo={flyTo}
                    dark={dark} onDark={()=>setDark(!dark)}
                    onReady={()=>setPainted(true)}
                    onlyRoute={onlyRoute} corridor={corridor} onSheet={setSheetOpen}
                    onPumps={setAreaPumps}/>
          <div className={`map-count${sheetOpen||town?' under':''}`}>
            <b>{inView.total} {inView.total === 1 ? 'thing' : 'things'} in view</b>
            <span className="muted">
              {noHit ? 'Could not find that one' : inView.total === 0
                ? 'Move the map to see what is out there'
                : `${inView.caravan} caravan parks, ${inView.camps} camps, ${inView.fuel} servos`}
            </span>
            {/* On a lap the corridor holds more than a map can carry, so it
                gets an even spread rather than the first fourteen hundred.
                Said out loud, because showing a subset silently tells somebody
                there is less out there than there is. */}
            {inView.corridorTotal > 0 && (
              <span className="muted">
                An even spread of the {inView.corridorTotal.toLocaleString()} along your
                route. Zoom in for all of them.
              </span>
            )}
            {/* The map credit lives here rather than in Leaflet's own box, so
                it fades with this strip when a camp opens instead of sitting
                on top of the photos. */}
            <a className="map-credit" href="https://www.openstreetmap.org/copyright"
               target="_blank" rel="noreferrer noopener">© OpenStreetMap</a>
          </div>
          <div className="town-bar">
            <span className="sub">Tap the map, or any stop, to see what is there.</span>
            <label className="radius"><span>Look within</span>
              <select value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[10,25,50,100].map(r=><option key={r} value={r}>{r} km</option>)}</select>
            </label>
          </div>
        </Card>

        {/* What is around a point you tapped, in the same sheet a camp opens in.
            It used to be a card in the page. On this tab the map is fixed over
            the whole screen, so that card rendered behind it: unreadable,
            unreachable, and bleeding through the tiles as a ghost of a list
            every time anybody tapped the map. The sheet is drawn over the map
            like everything else here, and closes.

            No diesel in it any more either. Fuel is on the map, priced, without
            a tap. */}
        {town && (
          <div className="map-sheet-scrim" onClick={()=>setTown(null)}>
          <div className="map-sheet town" onClick={e=>e.stopPropagation()}>
          <div className="sheet-grip" />
          <div className="sheet-head">
            <b>{town.busy?'Looking around...':`What is around ${town.name||'there'}`}</b>
            <button type="button" onClick={()=>setTown(null)}>Close</button>
          </div>
          {town.error && <p className="sub">{town.error}</p>}

          {/* Add what the map missed. Available the moment a point is open,
              because the time you know a spot is worth saving is the moment you
              have just looked at where it is. */}
          {atPoint && <div className="mine-add">
            {!adding ? <div className="mine-add-row">
              <span className="sub">Know somewhere here the map does not? Add it and everyone planning through {town.name||'here'} sees it.</span>
              <button className="ghost tiny" onClick={()=>{setAdding('camp');setAddError(null);}}>Add a camp</button>
              <button className="ghost tiny" onClick={()=>{setAdding('thing');setAddError(null);}}>Add an activity</button>
            </div> : <div className="mine-form">
              <span className="eyebrow">{adding==='camp'?'A camp':'Something to do'} at {town.name||'this point'}</span>
              <div className="mine-fields">
                <input aria-label="Name" placeholder={adding==='camp'?'What is it called':'What is it'} value={draft.name}
                       onChange={e=>setDraft({...draft,name:e.target.value})}/>
                {adding==='camp'
                  ? <input aria-label="Dollars a night" type="number" min={0} placeholder="$ a night" value={draft.nightly}
                           onChange={e=>setDraft({...draft,nightly:e.target.value})}/>
                  : <input aria-label="What sort of thing" placeholder="Swimming hole, lookout, markets" value={draft.what}
                           onChange={e=>setDraft({...draft,what:e.target.value})}/>}
                <input aria-label="Note" placeholder="Anything worth knowing" value={draft.note}
                       onChange={e=>setDraft({...draft,note:e.target.value})}/>
                <input aria-label="Your name" placeholder="Your first name (optional)" value={draft.addedBy}
                       onChange={e=>setDraft({...draft,addedBy:e.target.value})}/>
              </div>
              <div className="mine-actions">
                <button className="primary" disabled={!draft.name.trim()||saving} onClick={addPlace}>{saving?'Adding':'Add it for everyone'}</button>
                <button className="ghost" onClick={()=>{setAdding(null);setAddError(null);}}>Cancel</button>
              </div>
              {addError && <p className="sub add-error">{addError}</p>}
              <p className="sub">This goes on the public list. Put the name and the price, not a phone number or an address you would not want on a website.</p>
            </div>}
          </div>}

          {sharedThings.length>0 && <div className="things mine-things">
            {sharedThings.map(t=><div key={t.id} className="thing mine">
              <span className="thing-name">{t.name} <b className="yours">traveller</b></span>
              <em>{t.what}{` · ${t.directKm}km away · ${credit(t)}`}</em>
              {t.note && <em className="thing-hours">{t.note}</em>}
            </div>)}
          </div>}

          {!town.busy && found && <>
            {found.things?.length ? <div className="things">
              {found.things.map((t:any,i:number)=><div key={i} className="thing">
                <span className="thing-name">{t.name}</span>
                <em>{t.what}{t.free===true?' · free':''}{typeof t.directKm==='number'?` · ${t.directKm}km away`:''}</em>
                {t.hours && <em className="thing-hours">{t.hours}</em>}
              </div>)}
            </div> : sharedThings.length===0 && <p className="sub">Nothing mapped as a thing to do within {found.radius}km. Small towns are often blank in OpenStreetMap rather than empty in real life.</p>}

            <div className="around">
              {/* Fuel has its own panel above now that there are prices on it,
                  so the OSM servo list would only be the same places twice. */}
              {(['camps','water','dump'] as const).map(kind=>{
                const rows=found[kind]||[];
                const title=kind==='camps'?'Camps':kind==='water'?'Drinking water':'Dump points';
                return <div key={kind} className="around-col">
                  <span className="eyebrow">{title}</span>
                  {/* Travellers' camps first. They are the ones somebody has
                      actually stayed at, and a price from a person beats a
                      blank field from a database. */}
                  {kind==='camps'&&sharedCamps.map(c=><p key={c.id} className="place from-travellers">
                    <span>{c.name} <b className="yours">traveller</b></span>
                    <em>{c.directKm}km{c.nightly!=null?` · $${c.nightly}`:''} · {credit(c)}{c.note?` · ${c.note}`:''}</em>
                  </p>)}
                  {rows.length?rows.slice(0,5).map((r:any,i:number)=>{
                    const mine=kind==='camps'?knownPrice(r.name):undefined;
                    const rate=mine??r.nightly;
                    return <p key={i} className="place">
                      <span>{r.name}</span>
                      <em>{r.directKm}km
                        {rate?` · $${rate}${mine?' (you paid)':''}`:r.fee&&r.fee!=='unknown'?` · ${r.fee}`:''}
                        {r.amenities?` · ${r.amenities.slice(0,3).join(', ')}`:''}
                        {r.diesel?` · ${r.diesel}`:''}{r.open24?' · 24/7':''}</em>
                    </p>;
                  }):(kind==='camps'&&sharedCamps.length?null:<p className="none">None mapped within {found.radius}km</p>)}
                </div>;
              })}
              <p className="around-note">{found.note}</p>
            </div>
          </>}
          </div>
          </div>
        )}

      </>}

      {tab==='Legs' && <>
        <Card title="The legs">
          <div className="np-rule">
            <div className="totals-row">
              <Field label="People camping, 5 and over" value={p.party??4} prefix="" step={1} onChange={n=>update('party',n)}/>
              <Field label="National park, per person" value={p.npPerPerson??7.75} step={0.25} onChange={n=>update('npPerPerson',n)}/>
              <Field label="Family cap a night" value={p.npFamilyCap??31} step={1} onChange={n=>update('npFamilyCap',n)}/>
            </div>
            <p className="sub">A national park night comes to <strong>{aud(nationalParkNight(p))}</strong> for {p.party??4} of you. Queensland Parks charges per person with a family cap, so tick a stop as a park and it prices itself. Under fives are free, so leave them out of the count. Rates are the published Queensland ones and every state sets its own, so change them when you cross a border.</p>
          </div>
          <div className="legs">
          {(p.legs??[]).map((leg)=>(
            <div key={leg.id} className="leg">
              <div className="leg-line">
                <input aria-label="From" placeholder="From" value={leg.from} onChange={e=>updateLeg(leg.id,{from:e.target.value})}/>
                <span className="arrow">to</span>
                <input aria-label="To" placeholder="To" value={leg.to} onChange={e=>updateLeg(leg.id,{to:e.target.value})}/>
                {/* No buttons on a leg any more. Distance works itself out a
                    moment after both ends are typed. Pick on map and What is
                    there both went for the same reason: the map shows
                    everything around the road without being asked, so asking
                    it about one town is a job nobody has. */}
                {busy===leg.id && <span className="leg-working">working it out</span>}

                <button className="ghost danger" aria-label="Remove leg" onClick={()=>setP(v=>({...v,legs:(v.legs??[]).filter(x=>x.id!==leg.id)}))}>×</button>
              </div>
              <div className="leg-line numbers">
                <label><span>km</span><input type="number" min={0} value={leg.km} onChange={e=>updateLeg(leg.id,{km:Number(e.target.value)})}/></label>
                <label><span>nights</span><input type="number" min={0} value={leg.nights} onChange={e=>updateLeg(leg.id,{nights:Number(e.target.value)})}/></label>
                {/* The price this leg is costed at. Typed over, it stays typed:
                    somebody who knows they will fill at one servo knows better
                    than the middle of a board. */}
                <label className={leg.boardPrice?'board':''}>
                  <span>$/L</span>
                  <input type="number" step={0.01} min={0}
                         value={leg.boardPrice ?? p.dieselPrice}
                         onChange={e=>updateLeg(leg.id,{boardPrice:Number(e.target.value),boardCount:undefined})}/>
                </label>
                {leg.nationalPark
                  ? <span className="np-night">{aud(nationalParkNight(p))} a night · park rate</span>
                  : <label><span>$ a night</span><input type="number" min={0} value={leg.nightly} onChange={e=>updateLeg(leg.id,{nightly:Number(e.target.value)})} onBlur={e=>rememberPrice(leg.to,Number(e.target.value))}/></label>}
                <label className="np-tick"><input type="checkbox" checked={!!leg.nationalPark} onChange={e=>updateLeg(leg.id,{nationalPark:e.target.checked})}/><span>National park</span></label>
                <span className="leg-cost">{aud(leg.km*p.dieselPrice*(p.towingConsumption/100) + leg.nights*nightlyFor(leg,p))}</span>
              </div>
              {!leg.nationalPark&&knownPrice(leg.to)&&knownPrice(leg.to)!==leg.nightly &&
                <p className="leg-note">You paid {aud(knownPrice(leg.to)!)} at {leg.to} last time. <button className="ghost tiny" onClick={()=>updateLeg(leg.id,{nightly:knownPrice(leg.to)!})}>Use that</button></p>}
              {leg.note && <p className="leg-note">{leg.note}</p>}
            </div>))}
          </div>
          <button className="primary" onClick={()=>setP(v=>({...v,legs:[...(v.legs??[]),{id:String(Date.now()),from:'',to:'',km:0,nights:3,nightly:45}]}))}>Add a leg</button>
          {(p.legs??[]).length===0 && <p className="sub">Nothing planned yet. Add the first leg and the totals fill in underneath.</p>}
        </Card>

        {(p.legs??[]).length>0 && <Card title="What the road costs">
          <div className="totals-row">
            <Metric label="Legs" value={String(route.legs)}/>
            <Metric label="Distance" value={route.km.toLocaleString('en-AU')+' km'}/>
            {route.roadPrice!=null && <Metric label="Diesel on this road"
              value={'$'+route.roadPrice.toFixed(3)+'/L'}
              tone={route.roadPrice>p.dieselPrice?'warn':'good'}/>}
            <Metric label="Nights away" value={String(route.nights)}/>
          </div>
          <div className="totals-row">
            <Metric label="Fuel" value={aud(route.fuel)}/>
            <Metric label="Sites" value={aud(route.stay)}/>
            <Metric label="Fuel and sites" value={aud(route.total)} tone="green"/>
          </div>
          <div className="totals-row">
            <Metric label="Per night on the road" value={aud(route.perNight)}/>
            <Metric label="Per week on the road" value={aud(route.perWeek)}/>
            <Metric label="Weeks of travel" value={(route.nights/7).toFixed(1)}/>
          </div>
          <p className="sub">This is only fuel and sites. Food, insurance and everything else is on the Money tab, and it keeps running whether you are moving or parked.</p>
        </Card>}

        {gaps && gaps.servos>0 && (
          <Card title="Long stretches with no fuel">
            <p className="sub" style={{marginTop:0}}>
              {gaps.servos} servos on this road, {gaps.priced} of them reporting a price.
              Your range is {gaps.tankRange} km on a full tank, {gaps.range} km once you keep
              {Math.round((p.fuelReserve??0.1)*100)}% in reserve, which is what these are measured against.
            </p>
            {gaps.gaps.length===0 ? (
              <p className="sub" style={{color:'#3ee6b2',fontWeight:700}}>
                Nothing on this road is further apart than your range. The longest run between
                servos is {gaps.longest} km.
              </p>
            ) : (
              <div className="gaps">
                {gaps.gaps.map((g,i)=>(
                  <div key={i} className="gap">
                    <strong>{g.km} km</strong>
                    <span>{g.from} to {g.to}</span>
                    <em>
                      {g.atKm} km into the trip, {g.over} km further than you can go.
                      {g.lastPrice? ` Fill at $${g.lastPrice.toFixed(3)} before it.`:' Fill before it.'}
                    </em>
                  </div>
                ))}
                <p className="sub" style={{marginBottom:0}}>
                  Worked out from every servo on the map, not only the ones reporting prices, so
                  it holds in the states with no price scheme. It cannot know which ones are open
                  or have diesel, so out west treat it as the best case.
                </p>
              </div>
            )}
          </Card>
        )}

        {(p.legs??[]).length>0 && (
          <Card title="Before you lose reception">
            <Offline legs={p.legs??[]}/>
          </Card>
        )}

        {(p.legs??[]).length>0 && plan.range>0 && <Card title="Where you have to fill">
          <p className="sub" style={{marginTop:0}}>
            A {p.tankLitres??140}L tank at {p.towingConsumption}L/100km towing is about{' '}
            <strong>{Math.round(fullTankRange(p)).toLocaleString('en-AU')}km</strong> if you run it
            dry. Keeping {Math.round((p.fuelReserve??0.1)*100)}% in reserve, everything below is
            worked out on <strong>{plan.range.toLocaleString('en-AU')}km</strong>.
          </p>

          {plan.stops.length===0 ? (
            <p className="sub">
              Nothing on this route goes further than a tank. You have done {plan.sinceFill.toLocaleString('en-AU')}km
              by the end of it, so fill when it suits rather than because you have to.
            </p>
          ) : (
            <div className="fills">
              {plan.stops.map((stop,i)=>{
                const priced=fillAt(stop.atPoint);
                const cheapest=priced?.cheapest;
                const litres=Math.max(stop.litres,0);
                return <div key={`${stop.legId}-${i}`} className="fill">
                  <div className="fill-where">
                    <span className="eyebrow">Fill {stop.midLeg?'somewhere along':'before'} {stop.legLabel}</span>
                    <strong>{stop.at}</strong>
                    <em>
                      {stop.midLeg
                        ? 'That leg is longer than a full tank, so you are stopping on the way whatever you do.'
                        : `${stop.sinceFill.toLocaleString('en-AU')}km since your last fill. The next leg will not fit on what is left.`}
                    </em>
                  </div>
                  <div className="fill-cost">
                    {cheapest ? <>
                      <strong>{aud(litres*cheapest.price)}</strong>
                      <em>{litres}L at ${cheapest.price.toFixed(3)}</em>
                      <em className="fill-servo">{cheapest.name}{cheapest.directKm?` · ${cheapest.directKm}km`:''}</em>
                    </> : priced?.note ? <em>{priced.note}</em>
                      : i<8 ? <em>{litres}L. Getting prices…</em>
                      : <em>{litres}L. Prices are only looked up for the first eight fills.</em>}
                  </div>
                </div>;
              })}
            </div>
          )}
          <p className="around-note">
            Costed on the cheapest servo reporting within 30km of that stop, which is the one you would go out of your
            way for in town. Distances are the road distances on the legs above.
          </p>
        </Card>}
      </>}

      {tab==='Money' && <>
        {/* Nothing is assumed, so until there is something to work with the
            answer is a question rather than a verdict on an empty plan. */}
        {p.startingMoney<=0 ? (
          <div className="hero">
            <div>
              <span className="eyebrow">Before you pull out of the driveway</span>
              <h2>Start with what you have saved</h2>
              <p>
                Put your figure in below and fill in what a week actually costs your household.
                Nothing here comes pre filled, because somebody else&apos;s grocery bill is not yours.
              </p>
            </div>
          </div>
        ) : (
          <div className="hero">
            <div>
              <span className="eyebrow">Before you pull out of the driveway</span>
              <h2>{status==='green'?`That lasts the ${saySpan(p.duration)}`:status==='amber'?'That is close to the time you want':'The money runs out early'}</h2>
              <p>Starting with <b>{aud(p.startingMoney)}</b> and spending <b>{aud(burn)}</b> a month, you have <b>{saySpan(runway)}</b> on the road.</p>
            </div>
            <div className={`status ${status}`}><span>Money left after {saySpan(p.duration)}</span><strong>{aud(afterMonths(p.duration))}</strong><small>{afterMonths(p.duration)<0?`${aud(Math.abs(afterMonths(p.duration)))} short`:'Still in front'}</small></div>
          </div>
        )}

        <Card id="sec-start" title="What you are starting with">
          <div className="grid two">
            <Field label="Money available before the trip" value={p.startingMoney} step={1000} hint="What you have saved" onChange={n=>update('startingMoney',n)}/>
            <div>
              <div className="duration">{[3,6,12,18,24].map(x=><button key={x} className={p.duration===x?'selected':''} onClick={()=>{update('duration',x);setSpanText(String(x));setSpanUnit('months');}}>{x} months</button>)}</div>
              {/* Not everybody goes for a round number of months. Five weeks
                  off is a real trip and the presets could never say it. */}
              <div className="span-manual">
                <span>Or exactly</span>
                <input aria-label="How long" type="number" min={1} step={1} value={spanText}
                       onChange={e=>{
                         setSpanText(e.target.value);
                         const n=Number(e.target.value);
                         if(n>0) update('duration',spanUnit==='weeks'?n/WEEKS_PER_MONTH:n);
                       }}/>
                <select aria-label="Weeks or months" value={spanUnit}
                        onChange={e=>{
                          const unit=e.target.value as 'weeks'|'months';
                          setSpanUnit(unit);
                          const n=Number(spanText);
                          if(n>0) update('duration',unit==='weeks'?n/WEEKS_PER_MONTH:n);
                        }}>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </select>
                <b>{saySpan(p.duration)}</b>
              </div>
            </div>
          </div>
          <div className="metrics"><Metric label="Starting money" value={aud(p.startingMoney)}/><Metric label="Monthly burn" value={aud(burn)}/><Metric label="Weekly burn" value={aud(weeklyBudget(p))}/><Metric label="Runway" value={`${runway.toFixed(1)} months`} tone={status}/></div>
        </Card>

        <Card id="sec-fuel" title="Fuel, the biggest line in the plan">
            <p className="sub">Nobody tows every day. Put in what a driving day looks like and how many of them you do, and the rest follows.</p>
            <div className="totals-row"><Metric label={`Kilometres a ${p.budgetPeriod??"month"}`} value={kmPerPeriod(p).toLocaleString('en-AU')+" km"}/><Metric label="Fuel per week" value={aud(fuelCost(p)*12/52)}/><Metric label="Fuel per month" value={aud(fuelCost(p))}/></div>
            <p className="sub">{p.dieselPrice.toFixed(2)} a litre, {p.towingConsumption}L per 100km, {p.kmPerTravelDay??0}km on a driving day, {p.travelDays??0} driving {(p.travelDays??0)===1?"day":"days"} a {p.budgetPeriod??"month"}.</p>
            <Field label="Diesel price per litre" value={p.dieselPrice} step={0.01} onChange={n=>update('dieselPrice',n)}/>
            {/* A real number beats a remembered one, and it arrives on its own.
                These are the servos the map is showing, so moving the map moves
                these figures. It asked for a tap on a town before, which is a
                thing to remember to do before a budget will tell you the
                truth. */}
            {areaDiesel
              ? <p className="sub">Across the {areaDiesel.count} {areaDiesel.count===1?'servo':'servos'} on the map now: average <strong>${areaDiesel.average.toFixed(3)}</strong>, cheapest <strong>${areaDiesel.cheapest.price.toFixed(3)}</strong> at {areaDiesel.cheapest.name}.
                  <button className="ghost tiny" onClick={()=>update('dieselPrice',Number(areaDiesel.average.toFixed(3)))}>Use the average</button>
                  <button className="ghost tiny" onClick={()=>update('dieselPrice',Number(areaDiesel.cheapest.price.toFixed(3)))}>Use the cheapest</button></p>
              : <p className="sub">Move the map on the Explore tab over where you are going and the real diesel prices land here on their own.</p>}
            <Field label="Towing consumption (L/100km)" value={p.towingConsumption} prefix="" step={0.5} onChange={n=>update('towingConsumption',n)}/>
            <Field label="Tank size (litres)" value={p.tankLitres??140} prefix="" step={5} onChange={n=>update('tankLitres',n)}/>
            <label className="reserve">
              <span>Fuel you will not use</span>
              <select value={String(Math.round((p.fuelReserve??0.1)*100))}
                      onChange={e=>update('fuelReserve',Number(e.target.value)/100)}>
                {[0,5,10,15,20,25].map(n=><option key={n} value={n}>{n}%</option>)}
              </select>
              <em>
                A tank is not a range. {p.tankLitres??140}L at {p.towingConsumption}L/100km is{' '}
                {Math.round(fullTankRange(p))}km on paper, but that is arriving on fumes with
                nothing left for a headwind, a detour, a hill, or a servo that turns out to be shut.
                At {Math.round((p.fuelReserve??0.1)*100)}% you plan to roll in with{' '}
                {Math.round((p.tankLitres??140)*(p.fuelReserve??0.1))}L still in the tank, so every
                fill up and every warning here works to {Math.round(tankRange(p))}km instead.
                Set it to 0% and it will happily plan you to empty.
              </em>
            </label>
            <p className="sub">That is about <strong>{Math.round(tankRange(p)).toLocaleString('en-AU')}km</strong> on a tank towing. The Route tab uses it to work out where you have to fill.</p>
            <Field label="Kilometres on a driving day" value={p.kmPerTravelDay??400} prefix="" step={25} onChange={n=>update('kmPerTravelDay',n)}/>
            <Field label={`Driving days a ${p.budgetPeriod??"month"}`} value={p.travelDays??1} prefix="" step={1} onChange={n=>update('travelDays',n)}/>
            <div className="callout">
            <Metric label="Monthly fuel cost" value={aud(fuelCost(p))}/>
            <Metric label="Share of everything you spend" value={burn>0?`${Math.round(fuelCost(p)/burn*100)}%`:'—'} tone="green"/>
            <Metric label="Total monthly burn" value={aud(burn)}/>
            <Metric label="Over the whole trip" value={aud(fuelCost(p)*p.duration)}/>
          </div>
          </Card>

        <Card id="sec-chart" title={step==='week'?'Money left, week by week':'Money left, month by month'}>
          <MiniChart data={projection} />
          <div className="chart-labels">
            <span>Now</span>
            <span>{saySpan(p.duration/2)}</span>
            <span>{saySpan(p.duration)}</span>
            <span>{saySpan(projection.length*stepMonths)}</span>
          </div>
          <div className="inline-metrics">{[0.25,0.5,1,1.5].map(f=>{
            const at=p.duration*f;
            return <Metric key={f} label={`After ${saySpan(at)}`} value={aud(afterMonths(at))} tone={afterMonths(at)<0?'red':''}/>;
          })}</div>
        </Card>

        <Card id="sec-spend" title="Everything else">
          <div className="period-row">
            <div className="duration">{(['week','month'] as Period[]).map(x=><button key={x} className={(p.budgetPeriod??'month')===x?'selected':''} onClick={()=>setP(v=>({...v,budgetPeriod:x,budget:convertBudget(v.budget,v.budgetPeriod??'month',x),kmPerMonth: Math.round(x==='week'? v.kmPerMonth/WEEKS_PER_MONTH : v.kmPerMonth*WEEKS_PER_MONTH)}))}>Enter per {x}</button>)}</div>
            <p className="sub">Change this and the numbers convert with it, so what you are planning to spend stays the same. A month is 4.33 weeks, not four.</p>
          </div>
          <div className="totals-row">
            <Metric label="Per week" value={aud(weeklyBudget(p))}/>
            <Metric label="Per month" value={aud(monthlyBudget(p))}/>
            <Metric label={`Over ${saySpan(p.duration)}`} value={aud(monthlyBudget(p)*p.duration)}/>
          </div>
          {/* Fuel is not in this list and is not typed anywhere. It comes
              straight off the fuel model underneath and is shown here so it
              is obvious it has been counted, not so it can be edited twice.
              Any Fuel line left in an older saved plan is ignored. */}
          <div className="field derived">
            <span>Fuel, from the fuel model</span>
            <div><b>{aud((p.budgetPeriod??'month')==='week'?fuelCost(p)/WEEKS_PER_MONTH:fuelCost(p))}</b></div>
          </div>
          {budgetTotal(p)<=0 && <p className="sub">Nothing here is filled in for you. Put in what your household actually spends — leave a line blank if it does not apply.</p>}
          {/* Thirteen fields is the longest thing on the page and it is filled
              in once. Folding it away afterwards is the difference between a
              page you scroll past and a page you scroll through. */}
          {lines ? (
            <>
              {Object.entries(p.budget)
                .filter(([k])=>k.trim().toLowerCase()!=='fuel')
                .map(([k,v])=><Field key={k} label={k} value={v} onChange={n=>update('budget',{...p.budget,[k]:n})}/>)}
              {budgetTotal(p)>0 && <button className="ghost" style={{marginTop:12}} onClick={()=>setLines(false)}>Fold these away</button>}
            </>
          ) : (
            <button className="ghost" style={{width:'100%'}} onClick={()=>setLines(true)}>
              Show the {Object.keys(p.budget).filter(k=>k.trim().toLowerCase()!=='fuel').length} lines
            </button>
          )}
        </Card>

        <Card id="sec-saved" title="Saved plans"><div className="saved">{saved.length?saved.map((s,i)=><button key={i} onClick={()=>setP(s.data)}>{s.name}<small>{aud(s.data.startingMoney)} to start</small></button>):<p>No saved plans yet. Set one up, then save it from the top bar.</p>}</div></Card>
      </>}
    </main>
    <footer>Planning tool only. Places come from OpenStreetMap and are only as good as what volunteers have mapped.</footer>
  </div>;
}
