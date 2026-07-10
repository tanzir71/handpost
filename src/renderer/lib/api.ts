import type { RelayApi, RelaySnapshot } from '../../shared/api';
const empty:RelaySnapshot={accounts:[],posts:[],targets:[],media:[],attempts:[],slots:[],templates:[],settings:[]};
const demo:RelayApi={snapshot:async()=>empty,savePost:async()=>1,queuePost:async()=>1,reschedule:async()=>{},retry:async()=>{},connect:async()=>{},reenable:async()=>{},attachMedia:async()=>[],addMedia:async()=>[],updateMediaAlt:async()=>{},saveTemplate:async()=>1,saveSetting:async()=>{},saveAccountSettings:async()=>{},csvImport:async()=>[],exportData:async()=>'',importData:async()=>{},openManual:async()=>{}};
export const relayApi:RelayApi=window.relay??demo;
