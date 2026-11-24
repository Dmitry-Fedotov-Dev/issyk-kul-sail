// Отдельный поток для атласа облаков: генерация (~1-4 с процессора на телефоне) не отнимает время у кадров.
// build.mjs собирает этот файл в строку и встраивает в игру (__CLOUD_WORKER__); поток создаётся из Blob.
import { makeCloudAtlas } from './cloudart.js';
self.onmessage = () => { const A = makeCloudAtlas(); self.postMessage({ data: A.data, rects: A.rects, meta: A.meta }, [A.data.buffer]); };
