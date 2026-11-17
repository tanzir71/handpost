import { useState } from 'react';
import { Sidebar, type Screen } from './components/Sidebar';
import { Composer } from './components/Composer';
import { Calendar } from './components/Calendar';
import { Queue } from './components/Queue';
import { Accounts } from './components/Accounts';
import { Settings } from './components/Settings';
import { Logs } from './components/Logs';
import { useSnapshot } from './hooks/useSnapshot';
export function App(){const [screen,setScreen]=useState<Screen>('composer');const {data,loading,error,refresh}=useSnapshot();return <div className="app-shell"><Sidebar screen={screen} onNavigate={setScreen}/><div className="content">{error&&<div className="error-banner">{error}</div>}{loading?<div className="loading">Loading Handpost…</div>:screen==='composer'?<Composer accounts={data.accounts} templates={data.templates} posts={data.posts} targets={data.targets} storedMedia={data.media} onSaved={()=>void refresh()}/>:screen==='calendar'?<Calendar targets={data.targets} onChanged={()=>void refresh()}/>:screen==='queue'?<Queue targets={data.targets} attempts={data.attempts} onChanged={()=>void refresh()}/>:screen==='accounts'?<Accounts accounts={data.accounts} slots={data.slots} settings={data.settings} onChanged={()=>void refresh()}/>:screen==='settings'?<Settings settings={data.settings} onChanged={()=>void refresh()}/>:<Logs attempts={data.attempts}/>}</div></div>}
