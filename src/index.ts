export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/api/')) {
			return handleApi(request, env, url);
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

async function ensureTable(db: D1Database) {
	await db.exec(`
		CREATE TABLE IF NOT EXISTS appointments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			date TEXT NOT NULL,
			time TEXT NOT NULL,
			created_at TEXT DEFAULT (datetime('now')),
			UNIQUE(date, time)
		)
	`);
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};

	if (request.method === 'OPTIONS') {
		return new Response(null, { headers });
	}

	await ensureTable(env.DB);

	if (url.pathname === '/api/appointments' && request.method === 'GET') {
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');

		if (!from || !to) {
			return new Response(JSON.stringify({ error: 'Missing from/to parameters' }), { status: 400, headers });
		}

		const result = await env.DB.prepare(
			'SELECT date, time FROM appointments WHERE date >= ? AND date <= ? ORDER BY date, time'
		).bind(from, to).all();

		return new Response(JSON.stringify(result.results), { headers });
	}

	if (url.pathname === '/api/appointments' && request.method === 'POST') {
		let body: { name: string; email: string; date: string; time: string };
		try {
			body = await request.json() as typeof body;
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
		}

		const { name, email, date, time } = body;

		if (!name || !email || !date || !time) {
			return new Response(JSON.stringify({ error: 'Missing required fields: name, email, date, time' }), { status: 400, headers });
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return new Response(JSON.stringify({ error: 'Invalid email format' }), { status: 400, headers });
		}

		const validTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
		if (!validTimes.includes(time)) {
			return new Response(JSON.stringify({ error: 'Invalid time slot' }), { status: 400, headers });
		}

		const dateObj = new Date(date + 'T00:00:00');
		const day = dateObj.getDay();
		if (day === 0 || day === 6) {
			return new Response(JSON.stringify({ error: 'Appointments are only available on weekdays' }), { status: 400, headers });
		}

		try {
			await env.DB.prepare(
				'INSERT INTO appointments (name, email, date, time) VALUES (?, ?, ?, ?)'
			).bind(name, email, date, time).run();

			return new Response(JSON.stringify({ success: true }), { status: 201, headers });
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : '';
			if (message.includes('UNIQUE constraint failed')) {
				return new Response(JSON.stringify({ error: 'This time slot is already booked' }), { status: 409, headers });
			}
			return new Response(JSON.stringify({ error: 'Failed to create appointment' }), { status: 500, headers });
		}
	}

	return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
}
