export const assetBase = import.meta.env.BASE_URL;
export const tutorHome = import.meta.env.VITE_TUTOR_HOME || 'https://fudaozuoye.com/';

const sameOriginApi = ['fudaozuoye.com', 'www.fudaozuoye.com'].includes(location.hostname);
const apiBase = sameOriginApi ? '/api' : (import.meta.env.VITE_TUTOR_API_BASE || '/api');
export const notebookApi = apiBase.replace(/\/$/, '') + '/notebook';
