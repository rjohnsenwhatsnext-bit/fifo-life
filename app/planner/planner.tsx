'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
// Leaflet touches window on import, so the map is only pulled in on the
// client and only when the Route tab is actually opened.
const RouteMap = dynamic(()=>import('./map'), { ssr: false, loading: ()=><div className="map skeleton" /> });
import { aud, buildProjection, defaults, type PlanInputs, type Period, fuelCost, monthlyBudget, weeklyBudget, kmPerPeriod, routeTotals, nationalParkNight, nightlyFor, type Leg, convertBudget, WEEKS_PER_MONTH, runwayMonths } from '../../lib/planner';

type Tab = 'Route' | 'Money';

function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}>{title && <h2>{title}</h2>}{children}</section>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong></div>; }
function MiniChart({ data, dataKey = 'cash', color = '#3ee6b2' }: { data: Record<string,number>[]; dataKey?: string; color?: string }) { const values = data.map(x => x[dataKey]); const max = Math.max(...values, 1), min = Math.min(...values, 0), range = Math.max(max-min, 1); const points = values.map((v,i) => `${i/(values.length-1)*100},${100-(v-min)/range*92-4}`).join(' '); return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart"><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>; }
function Field({ label, value, onChange, prefix = '$', step = 100, min = 0 }: { label: string; value: number; onChange: (v:number)=>void; prefix?: string; step?: number; min?: number }) { return <label className="field"><span>{label}</span><div><i>{prefix}</i><input aria-label={label} type="number" min={min} step={step} value={Number.isFinite(value) ? value : 0} onChange={e=>onChange(Math.max(min, Number(e.target.value)))} /></div></label>; }
function Stepper({ label, value, onChange, step, prefix = '$', suffix = '' }: { label: string; value: number; onChange: (v:number)=>void; step: number; prefix?: string; suffix?: string }) { return <div className="stepper"><span>{label}</span><div><button aria-label={`Decrease ${label}`} onClick={()=>onChange(Math.max(0,value-step))}>−</button><b>{prefix}{value.toLocaleString('en-AU')}{suffix}</b><button aria-label={`Increase ${label}`} onClick={()=>onChange(value+step)}>+</button></div></div>; }

function TripBudget({ p, update }: { p: PlanInputs; update: (key: keyof PlanInputs, value: unknown) => void }) {
  const days=p.tripWeeks*7; const fuel=fuelCost(p)/4.333*p.tripWeeks*(1+p.tripFuelAdjustment/100); const groceries=p.tripGroceriesPerDay*days; const accommodation=p.tripAccommodationNight*p.tripAccommodationNights; const total=fuel+groceries+accommodation;
  return <Card title="One trip, costed"><p className="sub">Use the + and − controls to test a longer run, a bigger grocery spend, or more paid caravan park nights.</p><div className="trip-grid"><Stepper label="Weeks away" value={p.tripWeeks} step={1} prefix="" suffix=" weeks" onChange={n=>update('tripWeeks',n)}/><Stepper label="Fuel distance adjustment" value={p.tripFuelAdjustment} step={10} prefix="" suffix="%" onChange={n=>update('tripFuelAdjustment',n)}/><Stepper label="Groceries per day" value={p.tripGroceriesPerDay} step={5} onChange={n=>update('tripGroceriesPerDay',n)}/><Stepper label="Accommodation per night" value={p.tripAccommodationNight} step={5} onChange={n=>update('tripAccommodationNight',n)}/><Stepper label="Paid accommodation nights" value={p.tripAccommodationNights} step={1} prefix="" suffix=" nights" onChange={n=>update('tripAccommodationNights',n)}/></div><div className="trip-total"><Metric label="Fuel for this trip" value={aud(fuel)}/><Metric label="Groceries" value={aud(groceries)}/><Metric label="Accommodation" value={aud(accommodation)}/><Metric label="Total trip budget" value={aud(total)} tone="green"/><Metric label="Average per week" value={aud(total/Math.max(1,p.tripWeeks))}/><Metric label="Average per day" value={aud(total/Math.max(1,days))}/></div></Card>;
}

export default function Planner() {
  const [p, setP] = useState<PlanInputs>(defaults);
  const [tab,setTab] = useState<Tab>('Route');
  const [dark,setDark]=useState(true);
  const [saved,setSaved] = useState<{name:string;data:PlanInputs}[]>([]);
  useEffect(()=>{ const item=localStorage.getItem('trip-planner-scenarios'); if(item) try{setSaved(JSON.parse(item));}catch{} },[]);
  const update=(key: keyof PlanInputs, value: unknown)=>setP(x=>({...x,[key]:value}));
  const [busy,setBusy]=useState<string|null>(null);
  const route=routeTotals(p);
  const [around,setAround]=useState<Record<string,any>>({});
  const [picking,setPicking]=useState<{legId:string;end:'from'|'to'}|null>(null);
  // How far out to look when somebody taps a town. Twenty five kilometres is
  // about what you would drive after tea; further than that is a day out.
  const [radius,setRadius]=useState(25);

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
  const onTown=useCallback(async(at:[number,number],name?:string)=>{
    const key=`${at[0].toFixed(3)},${at[1].toFixed(3)}`;
    setTown({key,name:name||'',busy:true});
    try{
      const res=await fetch('/api/nearby',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({at,radius})});
      const d=await res.json();
      if(!res.ok){setTown({key,name:name||'',busy:false,error:d.error||'Nothing mapped around there.'});return;}
      setAround(v=>({...v,[key]:d}));
      setTown({key,name:name||d.at||'that spot',busy:false});
    }catch{
      setTown({key,name:name||'',busy:false,error:'Could not reach the map.'});
    }
  },[radius]);

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

  // Looked up one leg at a time, on purpose. The map data is free and run on
  // donated servers, and firing off a dozen requests because somebody pasted an
  // itinerary is how that stops being free.
  const lookup=async(leg:Leg)=>{
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
  };

  const projection=useMemo(()=>buildProjection(p),[p]);
  const burn=monthlyBudget(p);
  const runway=runwayMonths(p);
  const save=()=>{const name=`Plan ${saved.length+1}`;const next=[...saved,{name,data:p}];setSaved(next);localStorage.setItem('trip-planner-scenarios',JSON.stringify(next));};
  const csv=()=>{const content=['month,money left,spent so far',...projection.map(r=>[r.month,Math.round(r.cash),Math.round(r.spent)].join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv'}));a.download='trip-plan.csv';a.click();URL.revokeObjectURL(a.href);};
  const afterMonths=(m:number)=>projection[m-1]?.cash ?? p.startingMoney;
  const status=runway>=p.duration?'green':runway>=p.duration*0.75?'amber':'red';
  const found=town&&around[town.key]?around[town.key]:null;

  return <div className={dark?'planner dark':'planner'}>
    {/* No title here. The page around it carries the heading, because that is
        the one a search engine reads and two of them on a screen is one too
        many. What is left is the row of things you actually press. */}
    <header className="top embedded">
      <div className="actions"><button onClick={()=>setDark(!dark)}>{dark?'☀ Light':'☾ Dark'}</button><button onClick={()=>setP(defaults)}>Reset defaults</button><button onClick={save}>Save plan</button><button onClick={csv}>Export CSV</button><button className="primary" onClick={()=>window.print()}>Print / PDF</button></div>
    </header>
    <nav className="tabs">{(['Route','Money'] as Tab[]).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</nav>
    <main>
      {tab==='Route' && <>
        <Card className="map-card">
          <RouteMap legs={p.legs??[]} around={around} picking={picking} onPick={onPick} onTown={onTown}/>
          <div className="town-bar">
            <span className="sub">Tap the map, or any stop, to see what is there.</span>
            <label className="radius"><span>Look within</span>
              <select value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[10,25,50,100].map(r=><option key={r} value={r}>{r} km</option>)}</select>
            </label>
          </div>
        </Card>

        {town && <Card className="town" title={town.busy?'Looking around...':`What is around ${town.name||'there'}`}>
          {town.error && <p className="sub">{town.error}</p>}
          {!town.busy && found && <>
            {found.things?.length ? <div className="things">
              {found.things.map((t:any,i:number)=><div key={i} className="thing">
                <span className="thing-name">{t.name}</span>
                <em>{t.what}{t.free===true?' · free':''}{typeof t.directKm==='number'?` · ${t.directKm}km away`:''}</em>
                {t.hours && <em className="thing-hours">{t.hours}</em>}
              </div>)}
            </div> : <p className="sub">Nothing mapped as a thing to do within {found.radius}km. Small towns are often blank in OpenStreetMap rather than empty in real life.</p>}

            <div className="around">
              {(['camps','water','dump','fuel'] as const).map(kind=>{
                const rows=found[kind]||[];
                const title=kind==='camps'?'Camps':kind==='water'?'Drinking water':kind==='dump'?'Dump points':'Fuel';
                return <div key={kind} className="around-col">
                  <span className="eyebrow">{title}</span>
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
                  }):<p className="none">None mapped within {found.radius}km</p>}
                </div>;
              })}
              <p className="around-note">{found.note}</p>
            </div>
          </>}
        </Card>}

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
                <button className="ghost" disabled={busy===leg.id} onClick={()=>lookup(leg)}>{busy===leg.id?'Looking':'Distance'}</button>
                <button className="ghost" disabled={!leg.toAt} onClick={()=>leg.toAt&&onTown(leg.toAt,leg.to)}>What is there</button>
                <button className={picking?.legId===leg.id?'primary':'ghost'} onClick={()=>setPicking(picking?.legId===leg.id?null:{legId:leg.id,end:'from'})}>{picking?.legId===leg.id?'Tap the map':'Pick on map'}</button>
                <button className="ghost danger" aria-label="Remove leg" onClick={()=>setP(v=>({...v,legs:(v.legs??[]).filter(x=>x.id!==leg.id)}))}>×</button>
              </div>
              <div className="leg-line numbers">
                <label><span>km</span><input type="number" min={0} value={leg.km} onChange={e=>updateLeg(leg.id,{km:Number(e.target.value)})}/></label>
                <label><span>nights</span><input type="number" min={0} value={leg.nights} onChange={e=>updateLeg(leg.id,{nights:Number(e.target.value)})}/></label>
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
      </>}

      {tab==='Money' && <>
        <div className="hero">
          <div>
            <span className="eyebrow">Before you pull out of the driveway</span>
            <h2>{status==='green'?`That lasts the ${p.duration} months`:status==='amber'?'That is close to the time you want':'The money runs out early'}</h2>
            <p>Starting with <b>{aud(p.startingMoney)}</b> and spending <b>{aud(burn)}</b> a month, you have <b>{runway.toFixed(1)} months</b> on the road.</p>
          </div>
          <div className={`status ${status}`}><span>Money left after {p.duration} months</span><strong>{aud(afterMonths(p.duration))}</strong><small>{afterMonths(p.duration)<0?`${aud(Math.abs(afterMonths(p.duration)))} short`:'Still in front'}</small></div>
        </div>

        <Card title="What you are starting with">
          <div className="grid two">
            <Field label="Money available before the trip" value={p.startingMoney} step={1000} onChange={n=>update('startingMoney',n)}/>
            <div className="duration">{[6,12,18,24,36].map(x=><button key={x} className={p.duration===x?'selected':''} onClick={()=>update('duration',x)}>{x} months</button>)}</div>
          </div>
          <div className="metrics"><Metric label="Starting money" value={aud(p.startingMoney)}/><Metric label="Monthly burn" value={aud(burn)}/><Metric label="Weekly burn" value={aud(weeklyBudget(p))}/><Metric label="Runway" value={`${runway.toFixed(1)} months`} tone={status}/></div>
        </Card>

        <Card title={`Money left, month by month`}>
          <MiniChart data={projection.slice(0,36)} />
          <div className="chart-labels"><span>Now</span><span>12m</span><span>24m</span><span>36m</span></div>
          <div className="inline-metrics">{[6,12,24,36].map(m=><Metric key={m} label={`After ${m}m`} value={aud(afterMonths(m))} tone={afterMonths(m)<0?'red':''}/>)}</div>
        </Card>

        <div className="grid two">
          <Card title="Travel budget">
            <div className="period-row">
              <div className="duration">{(['week','month'] as Period[]).map(x=><button key={x} className={(p.budgetPeriod??'month')===x?'selected':''} onClick={()=>setP(v=>({...v,budgetPeriod:x,budget:convertBudget(v.budget,v.budgetPeriod??'month',x),kmPerMonth: Math.round(x==='week'? v.kmPerMonth/WEEKS_PER_MONTH : v.kmPerMonth*WEEKS_PER_MONTH)}))}>Enter per {x}</button>)}</div>
              <p className="sub">Change this and the numbers convert with it, so what you are planning to spend stays the same. A month is 4.33 weeks, not four.</p>
            </div>
            <div className="totals-row">
              <Metric label="Per week" value={aud(weeklyBudget(p))}/>
              <Metric label="Per month" value={aud(monthlyBudget(p))}/>
              <Metric label={`Over ${p.duration} months`} value={aud(monthlyBudget(p)*p.duration)}/>
            </div>
            {Object.entries(p.budget).map(([k,v])=><Field key={k} label={k} value={v} onChange={n=>update('budget',{...p.budget,[k]:n})}/>)}
          </Card>
          <Card title="Fuel model">
            <p className="sub">Nobody tows every day. Put in what a driving day looks like and how many of them you do, and the rest follows.</p>
            <div className="totals-row"><Metric label={`Kilometres a ${p.budgetPeriod??"month"}`} value={kmPerPeriod(p).toLocaleString('en-AU')+" km"}/><Metric label="Fuel per week" value={aud(fuelCost(p)*12/52)}/><Metric label="Fuel per month" value={aud(fuelCost(p))}/></div>
            <p className="sub">{p.dieselPrice.toFixed(2)} a litre, {p.towingConsumption}L per 100km, {p.kmPerTravelDay??0}km on a driving day, {p.travelDays??0} driving {(p.travelDays??0)===1?"day":"days"} a {p.budgetPeriod??"month"}.</p>
            <Field label="Diesel price per litre" value={p.dieselPrice} step={0.01} onChange={n=>update('dieselPrice',n)}/>
            <Field label="Towing consumption (L/100km)" value={p.towingConsumption} prefix="" step={0.5} onChange={n=>update('towingConsumption',n)}/>
            <Field label="Kilometres on a driving day" value={p.kmPerTravelDay??400} prefix="" step={25} onChange={n=>update('kmPerTravelDay',n)}/>
            <Field label={`Driving days a ${p.budgetPeriod??"month"}`} value={p.travelDays??1} prefix="" step={1} onChange={n=>update('travelDays',n)}/>
            <div className="callout"><Metric label="Monthly fuel cost" value={aud(fuelCost(p))}/><Metric label="Total monthly burn" value={aud(burn)}/><Metric label="Average weekly cost" value={aud(burn*12/52)}/><Metric label="Annual burn" value={aud(burn*12)}/></div>
          </Card>
        </div>

        <TripBudget p={p} update={update} />

        <Card title="Saved plans"><div className="saved">{saved.length?saved.map((s,i)=><button key={i} onClick={()=>setP(s.data)}>{s.name}<small>{aud(s.data.startingMoney)} to start</small></button>):<p>No saved plans yet. Set one up, then save it from the top bar.</p>}</div></Card>
      </>}
    </main>
    <footer>Planning tool only. Places come from OpenStreetMap and are only as good as what volunteers have mapped.</footer>
  </div>;
}
