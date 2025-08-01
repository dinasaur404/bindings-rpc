interface Env {
	DISPATCHER: Dispatcher;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		console.log('=== DEBUG INFO ===');
		console.log('Available env keys:', Object.keys(env));
		console.log('DISPATCHER exists:', !!env.DISPATCHER);
		
		const url = new URL(request.url);
		const userId = request.headers.get('X-User-ID');

		if (!userId) {
			return new Response('Missing X-User-ID header', { status: 400 });
		}

		try {
			// Move this inside the try-catch block
			if (!env.DISPATCHER) {
				throw new Error('DISPATCHER binding not found - check your wrangler.jsonc configuration');
			}

			console.log(`Getting worker for user: ${userId}`);
			const userWorker = env.DISPATCHER.get(userId);
			console.log('User worker obtained successfully');

			// Route to user worker methods
			if (url.pathname === '/files' && request.method === 'POST') {
				const formData = await request.formData();
				const file = formData.get('file') as File;
				const key = formData.get('key') as string;
				
				const result = await userWorker.uploadFile(key, await file.arrayBuffer());
				return Response.json(result);
			}

			if (url.pathname === '/files' && request.method === 'GET') {
				const key = url.searchParams.get('key');
				const file = await userWorker.getFile(key);
				
				if (!file) {
					return new Response('File not found', { status: 404 });
				}
				
				return new Response(file);
			}

			if (url.pathname === '/data' && request.method === 'POST') {
				const { key, value } = await request.json();
				const result = await userWorker.setData(key, value);
				return Response.json(result);
			}

			if (url.pathname === '/data' && request.method === 'GET') {
				const key = url.searchParams.get('key');
				const value = await userWorker.getData(key);
				return Response.json({ key, value });
			}

			if (url.pathname === '/stats' && request.method === 'GET') {
				const stats = await userWorker.getStats();
				return Response.json(stats);
			}

			// Add a simple test endpoint
			if (url.pathname === '/') {
				return new Response(`Dispatcher working! User: ${userId}`);
			}

			return new Response('Not found', { status: 404 });

		} catch (error) {
			console.error('Error details:', error);
			return Response.json({ 
				error: error.message,
				debug: {
					hasDispatcher: !!env.DISPATCHER,
					envKeys: Object.keys(env)
				}
			}, { status: 500 });
		}
	},
};