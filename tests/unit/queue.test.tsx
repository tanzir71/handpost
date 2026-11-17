// @vitest-environment jsdom
import { cleanup,render,screen } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
const mockApi=vi.hoisted(()=>({retry:vi.fn(),openManual:vi.fn(),readArtifact:vi.fn(async()=> 'data:image/png;base64,AA==')}));
vi.mock('../../src/renderer/lib/api',()=>({handpostApi:mockApi}));
import { Queue } from '../../src/renderer/components/Queue';
afterEach(()=>cleanup());
describe('Queue evidence',()=>{it('renders expandable step logs for failed targets',()=>{const targets=[{id:9,platform:'x',base_text:'failed post',status:'failed',scheduled_at_utc:'2026-01-01T00:00:00Z',error_code:'ui_drift',error_detail:'selector missing'}];const attempts=[{id:2,target_id:9,started_at:'2026-01-01T00:00:01Z',outcome:'failed',error_class:'ui_drift',step_log_json:JSON.stringify([{name:'open composer',startedAt:'2026-01-01T00:00:01Z',finishedAt:'2026-01-01T00:00:02Z',outcome:'failed',detail:'selector missing'}])}];const result=render(<Queue targets={targets} attempts={attempts} onChanged={()=>{}}/>);expect(result.container.querySelector('details.attempt-details')).toBeTruthy();expect(screen.getByText('open composer')).toBeTruthy();expect(screen.getAllByText('selector missing').length).toBeGreaterThan(0);});});
