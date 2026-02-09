export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Static assets from public/ are served automatically by Cloudflare Workers Assets.
		// This worker handles any requests that don't match a static file.
		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
