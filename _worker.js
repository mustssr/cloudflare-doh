/**
 * Cloudflare Worker that forwards requests based on path instead of subdomain
 * Example: doh.example.com/google/query-dns → dns.google/dns-query
 * Supports configuration via Cloudflare Worker variables
 */

// Default configuration for path mappings
const DEFAULT_PATH_MAPPINGS = {
	'/g': {
	//'/google': {
		targetDomain: 'dns.google',
		pathMapping: {
			'/u7jv3e4d': '/dns-query',
			//'/query-dns': '/dns-query',
		},
	},
	'/c': {
	//'/cloudflare': {
		targetDomain: 'dns.cloudflare.com',
		pathMapping: {
			'/u7jv3e4d': '/dns-query',
			//'/query-dns': '/dns-query',
		},
	},
	// Add more path mappings as needed
};

// 修改后的 HTML 内容 (Native HMAC Tool)
const HOMEPAGE_HTML = `<!DOCTYPE html>
<meta charset=utf-8>
<meta name=viewport content="width=device-width">
<title>HMAC</title>
<style>
body{max-width:500px;margin:20px auto;font:14px sans-serif;padding:10px}
input:not(#t),select,button,#o{width:100%;box-sizing:border-box;display:block;margin:0 0 10px;padding:8px;border:1px solid #ccc}
#o{min-height:38px;word-break:break-all;color:#000}
label{display:block;text-align:right;cursor:pointer;margin-bottom:5px}
</style>
<h3>Native HMAC</h3>
<label><input type=checkbox id=t>显示明文</label>
<input type=password id=m placeholder="消息 (Message)" autofocus>
<input type=password id=k placeholder="密钥 (Key)">
<div style="display:flex;gap:10px">
<select id=v><option>SHA-1<option>SHA-256<option>SHA-384<option selected>SHA-512</select>
<select id=f><option value=HEX>Hex<option value=B64>Base64</select>
</div>
<div id=o></div>
<button id=b>复制结果</button>
<script>
let R="";
const E=new TextEncoder,
D=_=>o.innerText=t.checked?R:R.slice(0,10).padEnd(R.length,"*"),
C=async()=>{
  try{
    let rawKey = k.value ? E.encode(k.value) : new Uint8Array(1);
    let K=await crypto.subtle.importKey("raw", rawKey, {name:"HMAC",hash:v.value},!1,["sign"]),
    s=await crypto.subtle.sign("HMAC",K,E.encode(m.value)),
    u=new Uint8Array(s);
    R=f.value=="HEX"?[...u].map(x=>x.toString(16).padStart(2,"0")).join(""):btoa(String.fromCharCode(...u)),D()
  }catch(e){
  }
};
oninput=C;
t.onchange=_=>{m.type=k.type=t.checked?"text":"password",D()};
b.onclick=_=>{R&&(navigator.clipboard.writeText(R),b.innerText="OK!",setTimeout(_=>b.innerText="复制结果",1e3))};
</script>`;

/**
 * Get path mappings from Cloudflare Worker env or use defaults
 * @param {Object} env - Environment variables from Cloudflare Worker
 * @returns {Object} Path mappings configuration
 */
function getPathMappings(env) {
	try {
		// Check if DOMAIN_MAPPINGS is defined in the env object
		if (env && env.DOMAIN_MAPPINGS) {
			// If it's a string, try to parse it as JSON
			if (typeof env.DOMAIN_MAPPINGS === 'string') {
				return JSON.parse(env.DOMAIN_MAPPINGS);
			}
			// If it's already an object, use it directly
			return env.DOMAIN_MAPPINGS;
		}
	} catch (error) {
		console.error('Error accessing DOMAIN_MAPPINGS variable:', error);
	}

	// Fall back to default mappings if the variable is not set
	return DEFAULT_PATH_MAPPINGS;
}

function serveHomepage() {
	// 直接返回内联的HTML内容
	return new Response(HOMEPAGE_HTML, {
		status: 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

async function handleRequest(request, env) {
	const url = new URL(request.url);
	const path = url.pathname;
	const queryString = url.search; // Preserves the query string with the '?'

	// If the path is explicitly '/index.html' or '/', serve the homepage
	if (path === '/index.html' || path === '/') {
		return serveHomepage();
	}

	// Get the path mappings from env or defaults
	const pathMappings = getPathMappings(env);

	// Find the matching path prefix
	const pathPrefix = Object.keys(pathMappings).find((prefix) => path.startsWith(prefix));

	if (pathPrefix) {
		const mapping = pathMappings[pathPrefix];
		const targetDomain = mapping.targetDomain;

		// Remove the prefix from the path
		const remainingPath = path.substring(pathPrefix.length);

		// Check if we have a specific path mapping for the remaining path
		let targetPath = remainingPath;
		for (const [sourcePath, destPath] of Object.entries(mapping.pathMapping)) {
			if (remainingPath.startsWith(sourcePath)) {
				targetPath = remainingPath.replace(sourcePath, destPath);
				break;
			}
		}

		// Construct the new URL with the preserved query string
		const newUrl = `https://${targetDomain}${targetPath}${queryString}`;

		// Clone the original request
		const newRequest = new Request(newUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
			redirect: 'follow',
		});

		// Forward the request to the target domain
		return fetch(newRequest);
	}

	// If no mapping is found, serve the homepage instead of 404
	return serveHomepage();
}

// Export the worker
export default {
	async fetch(request, env, ctx) {
		return handleRequest(request, env);
	},
};


