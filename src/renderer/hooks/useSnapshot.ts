import { useCallback, useEffect, useState } from 'react';
import type { RelaySnapshot } from '../../shared/api';
import { relayApi } from '../lib/api';
const initial:RelaySnapshot={accounts:[],posts:[],targets:[],media:[],attempts:[],slots:[],templates:[],settings:[]};
export function useSnapshot(){const [data,setData]=useState(initial);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const refresh=useCallback(async()=>{try{setData(await relayApi.snapshot());setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}},[]);useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30_000);return()=>clearInterval(timer);},[refresh]);return{data,loading,error,refresh};}
