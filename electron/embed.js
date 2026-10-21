// 本地语义嵌入：paraphrase-multilingual-MiniLM-L12-v2（ONNX int8，中英跨语言），首次运行可离线使用打包模型
const path = require('path'), fs = require('fs');
let pipe = null, loading = null, info = { ready: false, model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', dim: 384, error: null };
function modelDirs() { const c = [path.join(process.resourcesPath || '', 'models'), path.join(__dirname, '..', 'models')]; return c.filter(d => fs.existsSync(path.join(d, info.model))); }
async function load(userDir) {
  if (pipe) return pipe; if (loading) return loading;
  loading = (async () => { const T = await import('@huggingface/transformers');
    const local = modelDirs()[0]; if (local) { T.env.localModelPath = local; T.env.allowRemoteModels = false; } else { T.env.cacheDir = path.join(userDir, 'models'); }
    pipe = await T.pipeline('feature-extraction', info.model, { dtype: 'q8' }); info.ready = true; info.local = !!local; return pipe; })().catch(e => { info.error = e.message; loading = null; throw e; });
  return loading;
}
async function embed(texts, userDir) { const p = await load(userDir); const out = [];
  for (let i = 0; i < texts.length; i += 32) { const o = await p(texts.slice(i, i + 32).map(t => String(t).slice(0, 300)), { pooling: 'mean', normalize: true }); const d = o.data, n = o.dims[1]; for (let j = 0; j < o.dims[0]; j++) out.push(Float32Array.from(d.subarray(j * n, (j + 1) * n))); }
  return out; }
module.exports = { embed, info: () => info };
