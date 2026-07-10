import type { ErrorClass } from '../../shared/types';
export const RETRY_DELAYS_MS={transient:[60_000,300_000,900_000],ui_drift:[60_000],session:[],content:[],suspected_detection:[]} satisfies Record<ErrorClass,number[]>;
export function retryDelay(errorClass:ErrorClass,attempt:number):number|null{return RETRY_DELAYS_MS[errorClass][attempt-1]??null;}
export function classifyError(error:unknown):ErrorClass{const message=error instanceof Error?error.message:String(error);if(/captcha|unusual activity|action block/i.test(message))return'suspected_detection';if(/logged.?out|session|checkpoint/i.test(message))return'session';if(/too long|unsupported|rejected|duplicate/i.test(message))return'content';if(/timeout|network|ECONNRESET/i.test(message))return'transient';return'ui_drift';}
