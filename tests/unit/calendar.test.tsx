// @vitest-environment jsdom
import { fireEvent,render } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { Calendar } from '../../src/renderer/components/Calendar';
import { relayApi } from '../../src/renderer/lib/api';

vi.mock('../../src/renderer/lib/api',()=>({relayApi:{reschedule:vi.fn()}}));

describe('calendar rescheduling',()=>{
 beforeEach(()=>vi.mocked(relayApi.reschedule).mockReset());
 it('drags a scheduled target to another local calendar day while retaining its time',async()=>{const source=new Date();source.setHours(9,30,0,0);const target={id:12,platform:'x',scheduled_at_utc:source.toISOString()};const changed=vi.fn();const {container}=render(<Calendar targets={[target]} onChanged={changed}/>);const chip=container.querySelector<HTMLElement>('.calendar-chip')!;const cells=[...container.querySelectorAll<HTMLElement>('.day')];const destination=cells.find(cell=>cell.textContent?.startsWith(String(source.getDate()===1?2:1)))!;const data=new Map<string,string>();const dataTransfer={setData:(key:string,value:string)=>data.set(key,value),getData:(key:string)=>data.get(key)??''};fireEvent.dragStart(chip,{dataTransfer});fireEvent.drop(destination,{dataTransfer});await vi.waitFor(()=>expect(relayApi.reschedule).toHaveBeenCalledOnce());const call=vi.mocked(relayApi.reschedule).mock.calls[0]![0];const moved=new Date(call.scheduledAt);expect([moved.getHours(),moved.getMinutes()]).toEqual([9,30]);expect(changed).toHaveBeenCalledOnce();});
});
