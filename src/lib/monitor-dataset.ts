import { WaterSite } from '@/data/water-sites';

/** Map camera target for a specific water-site coordinate. */
export interface MapFocusLocation {
	id: string;
	lat: number;
	lng: number;
	state: string;
}

/** Convert a Google Sheets URL to CSV export format. */
export const getGoogleSheetsCSVUrl = (spreadsheetId: string, gid: string) => {
	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
};

/** Extract spreadsheet id and gid from a Google Sheets URL. */
export const parseSheetUrl = (url: string) => {
	const id = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? '';
	const gid = url.match(/[?#&]gid=(\d+)/)?.[1] ?? '0';
	return { id, gid };
};

/**
 * Quote-aware CSV line splitter so fields like
 * "Beside Emmanuel Lutheran Church Jambutu, Yola" stay intact.
 */
export const parseCsvLine = (line: string): string[] => {
	const fields: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === ',' && !inQuotes) {
			fields.push(current);
			current = '';
			continue;
		}

		current += char;
	}

	fields.push(current);
	return fields;
};

/** Split CSV text into rows, respecting quoted newlines if present. */
export const parseCsvRows = (csvText: string): string[][] => {
	const rows: string[][] = [];
	let current = '';
	let inQuotes = false;
	const lines: string[] = [];

	for (let i = 0; i < csvText.length; i++) {
		const char = csvText[i];

		if (char === '"') {
			if (inQuotes && csvText[i + 1] === '"') {
				current += '""';
				i++;
			} else {
				inQuotes = !inQuotes;
				current += char;
			}
			continue;
		}

		if ((char === '\n' || char === '\r') && !inQuotes) {
			if (char === '\r' && csvText[i + 1] === '\n') i++;
			if (current.length > 0 || lines.length === 0) {
				lines.push(current);
			}
			current = '';
			continue;
		}

		current += char;
	}

	if (current.length > 0) {
		lines.push(current);
	}

	for (const line of lines) {
		if (!line.trim()) continue;
		rows.push(parseCsvLine(line));
	}

	return rows;
};

/** Parse monitor CSV text into WaterSite records. */
export const parseCSVToWaterSites = (csvText: string): WaterSite[] => {
	const rows = parseCsvRows(csvText.trim());
	if (rows.length < 2) return [];

	const headers = rows[0].map((h) => h.trim());

	return rows.slice(1).map((values, index) => {
		const data: Record<string, string> = {};
		headers.forEach((header, i) => {
			data[header] = values[i]?.trim() || '';
		});

		let status: 'optimal' | 'warning' | 'critical' = 'optimal';
		if (data['HEALTH RISK LEVEL'] === 'High') status = 'critical';
		else if (data['HEALTH RISK LEVEL'] === 'Moderate') status = 'warning';

		let uptime = 98;
		if (status === 'critical') uptime = Math.random() * 20 + 70;
		else if (status === 'warning') uptime = Math.random() * 10 + 85;
		else uptime = Math.random() * 5 + 95;

		const state = data['STATES'] || '';
		const community = data['COMMUNITY'] || '';
		const infraPoint = data['WATER INFRASTRUCTURE POINTS'] || 'Site';

		return {
			id: `${state.substring(0, 2).toUpperCase() || 'XX'}-${String(
				index + 1
			).padStart(3, '0')}`,
			name: community || `${state} ${infraPoint} ${index + 1}`,
			type: 'borehole' as const,
			state,
			community: community || undefined,
			coordinates: [
				parseFloat(data['LONGTITUDE']) || 0,
				parseFloat(data['LATITUDE']) || 0,
			] as [number, number],
			quality: {
				ph: parseFloat(data['pH LEVEL']) || 7,
				turbidity: parseFloat(data['WATER TURBIDITY']) || 0,
				chlorine: parseFloat(data['CHLORINE LEVEL']) || 0,
			},
			uptime: Math.round(uptime * 10) / 10,
			status,
			lastMaintenance: new Date(
				Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000
			)
				.toISOString()
				.split('T')[0],
			peopleServed: Number(data['PEOPLE SERVED']) || 0,
			pumpType: data['PUMP TYPE'] || 'Motorized',
			contamination: parseFloat(data['CONTAMINATION']) || 0,
			healthRisk: data['HEALTH RISK LEVEL'] || 'Low',
			scarcity: data['SCARCITY'] === 'TRUE',
			principal: data['PRINCIPAL'] || '',
			isMonitored: data['IS MONITORED']?.toUpperCase() === 'TRUE',
			flowRate: (data['PUMP TYPE'] || '').toLowerCase().includes('hand')
				? ''
				: data['FLOW_RATE'] || '',
			movementRate:
				data['MOVEMENT_RATE'] &&
				data['MOVEMENT_RATE'].toUpperCase() !== 'NULL'
					? data['MOVEMENT_RATE']
					: (data['PUMP TYPE'] || '').toLowerCase().includes('hand') &&
					  data['FLOW_RATE'] &&
					  data['FLOW_RATE'].toUpperCase() !== 'NULL'
					? data['FLOW_RATE']
					: '',
			waterQualityRate:
				data['WATER_QUALITY_RATE'] &&
				data['WATER_QUALITY_RATE'].toUpperCase() !== 'NULL'
					? data['WATER_QUALITY_RATE']
					: '',
		};
	});
};

/** Fetch monitor CSV from the configured sheet, falling back to /dataset.csv. */
export const fetchMonitorCsv = async (): Promise<string> => {
	try {
		const { id: spreadsheetId, gid } = parseSheetUrl(
			import.meta.env.VITE_GEOTEK_MONITOR_DATA_SET_URL ?? ''
		);

		if (!spreadsheetId) {
			throw new Error('Missing VITE_GEOTEK_MONITOR_DATA_SET_URL');
		}

		const csvUrl = getGoogleSheetsCSVUrl(spreadsheetId, gid);
		const response = await fetch(csvUrl);

		if (!response.ok) {
			throw new Error(
				`Google Sheets fetch failed: ${response.status} ${response.statusText}`
			);
		}

		const csvText = await response.text();

		if (!csvText || csvText.trim().length === 0) {
			throw new Error('Empty CSV data from Google Sheets');
		}

		return csvText;
	} catch (sheetsError) {
		console.warn('Google Sheets failed, using local dataset:', sheetsError);
		const fallbackResponse = await fetch('/dataset.csv');
		return fallbackResponse.text();
	}
};

/** Fetch and parse the full monitor dataset into WaterSite[]. */
export const fetchMonitorSites = async (): Promise<WaterSite[]> => {
	const csvText = await fetchMonitorCsv();
	return parseCSVToWaterSites(csvText);
};
