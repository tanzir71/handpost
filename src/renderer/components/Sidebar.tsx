import { CalendarDays, FileClock, History, LayoutDashboard, PlugZap, Settings2 } from 'lucide-react';
import { BrandMark } from './BrandMark';
export type Screen='composer'|'calendar'|'queue'|'accounts'|'settings'|'logs';
interface SidebarProps{screen:Screen;onNavigate:(screen:Screen)=>void;}
const items=[['composer','Composer',LayoutDashboard],['calendar','Calendar',CalendarDays],['queue','Queue',FileClock],['accounts','Accounts',PlugZap],['logs','History',History],['settings','Settings',Settings2]] as const;
export function Sidebar({screen,onNavigate}:SidebarProps){return <aside className="sidebar"><div className="brand"><BrandMark className="brand-mark"/><div><strong className="brand-name">Handpost</strong><small>local scheduler</small></div></div><nav aria-label="Primary">{items.map(([id,label,Icon])=><button key={id} className={screen===id?'active':''} aria-current={screen===id?'page':undefined} onClick={()=>onNavigate(id)}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="privacy"><span className="status-dot ok"/>Local-only<br/><small>No telemetry · no cloud</small></div></aside>}
