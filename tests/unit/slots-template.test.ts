import { describe,expect,it } from 'vitest';
import { nextFreeSlot } from '../../src/main/scheduler/slots';
import { renderTemplate,templateVariables } from '../../src/main/templates/render';
describe('slots and templates',()=>{it('fills next unoccupied weekly slot',()=>{const from=new Date(2026,0,5,8);const occupied=[new Date(2026,0,5,9).toISOString()];const next=nextFreeSlot([{weekday:1,timeLocal:'09:00'},{weekday:1,timeLocal:'12:00'}],occupied,from);expect(next?.getHours()).toBe(12);});it('extracts unique variables and leaves missing values visible',()=>{expect(templateVariables('{name} from {place}, {name}')).toEqual(['name','place']);expect(renderTemplate('Hi {name} at {place}',{name:'Ada'})).toBe('Hi Ada at {place}');});});
