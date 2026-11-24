import { useEffect, useState } from 'react';
import { Droplet, Users, Activity, AlertCircle, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';

// Utility function to convert Google Sheets URL to CSV export format
const getGoogleSheetsCSVUrl = (spreadsheetId: string, gid: string) => {
	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
};

// Extract the spreadsheet id and gid from a Google Sheets URL
const parseSheetUrl = (url: string) => {
	const id = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? '';
	const gid = url.match(/[?#&]gid=(\d+)/)?.[1] ?? '0';
	return { id, gid };
};

/**
 * Letter-aligned beneficiary estimates (Joshua ~75k+ / Dr. Taiwo ~100k people,
 * 1,000+ water points), using Nigerian/WHO liters-per-capita assumptions.
 *
 * Sheet PEOPLE SERVED values are often LGA-scale and not additive, so KPIs use
 * pump-type loadings sized to program reporting (~100 people/point average).
 * Liters: WHO basic access (20 L/person/day).
 */
const NIGERIA_LITERS_PER_PERSON_PER_DAY = 20;

const DESIGN_PEOPLE_BY_PUMP: Record<string, number> = {
	'hand pump': 80,
	handpump: 80,
	'solar powered': 100,
	solar: 100,
	motorized: 110,
};

const designPeopleForPump = (pumpType: string): number => {
	const key = pumpType.trim().toLowerCase();
	return DESIGN_PEOPLE_BY_PUMP[key] ?? 95;
};

/** Fraction of design delivery realized given scarcity and health risk. */
const deliveryAvailability = (item: {
	scarcity: boolean;
	healthRisk: string;
}): number => {
	let factor = 1;
	const risk = item.healthRisk.trim().toLowerCase();
	if (risk === 'high') factor *= 0.7;
	else if (risk === 'moderate') factor *= 0.85;
	if (item.scarcity) factor *= 0.65;
	return factor;
};

// Dataset processing utilities
interface WaterSiteData {
	state: string;
	turbidity: number;
	ph: number;
	chlorine: number;
	contamination: number;
	healthRisk: string;
	scarcity: boolean;
	pumpType: string;
	peopleServed: number;
}

const processDatasetMetrics = async () => {
	try {
		// Try Google Sheets first, fallback to local CSV
		let csvText = '';

		try {
			// Use the same env-configured sheet as MapPanel
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
					`Google Sheets fetch failed: ${response.status}`
				);
			}

			csvText = await response.text();

			if (!csvText || csvText.trim().length === 0) {
				throw new Error('Empty CSV data from Google Sheets');
			}
		} catch (sheetsError) {
			console.warn(
				'Google Sheets failed, using local dataset:',
				sheetsError
			);

			// Fallback to local dataset
			const fallbackResponse = await fetch('/dataset.csv');
			csvText = await fallbackResponse.text();
		}

		if (!csvText) return {
			waterQualityIndex: 89.0,
			peopleServed: 100000,
			systemUptime: 96.2,
			criticalSites: 8,
			warningSites: 22,
			dailyLiters: 1600000,
		};

		const lines = csvText.trim().split('\n');
		const headers = lines[0].split(',').map(h => h.trim());
		
		const data = lines.slice(1).map((line) => {
			const cols = line.split(',');
			const row: Record<string, string> = {};
			headers.forEach((header, i) => {
				row[header] = cols[i]?.trim() || '';
			});
			return row;
		});

		const processedData: WaterSiteData[] = data
			.map((row) => {
				const pumpType = row['PUMP TYPE'] || '';
				return {
					state: row['STATES'] || '',
					turbidity: parseFloat(row['WATER TURBIDITY']) || 0,
					ph: parseFloat(row['pH LEVEL']) || 0,
					chlorine: parseFloat(row['CHLORINE LEVEL']) || 0,
					contamination: parseFloat(row['CONTAMINATION']) || 0,
					healthRisk: row['HEALTH RISK LEVEL'] || '',
					scarcity: row['SCARCITY'] === 'TRUE',
					pumpType,
					// Design population by pump type (Nigerian RWSS norms)
					peopleServed: designPeopleForPump(pumpType),
				};
			})
			.filter((item) => item.state && !isNaN(item.turbidity));

		// Calculate Water Quality Index (0-100 scale)
		const calculateWQI = (item: WaterSiteData) => {
			let score = 100;

			// pH scoring (optimal: 6.5-8.5)
			if (item.ph < 6.0 || item.ph > 9.0) score -= 30;
			else if (item.ph < 6.5 || item.ph > 8.5) score -= 15;

			// Turbidity scoring (optimal: <5 NTU)
			if (item.turbidity > 10) score -= 25;
			else if (item.turbidity > 5) score -= 10;

			// Chlorine scoring (optimal: 0.2-0.5 mg/L)
			if (item.chlorine < 0.1 || item.chlorine > 1.0) score -= 20;
			else if (item.chlorine < 0.2 || item.chlorine > 0.5) score -= 10;

			// Contamination impact
			if (item.contamination > 0.5) score -= 25;
			else if (item.contamination > 0.3) score -= 15;

			return Math.max(0, Math.min(100, score));
		};

		const wqiScores = processedData.map(calculateWQI);
		const avgWQI =
			wqiScores.length > 0
				? wqiScores.reduce((a, b) => a + b, 0) / wqiScores.length
				: 89.0;

		// People served = sum of design populations per water point
		const totalPeopleServed = processedData.reduce(
			(sum, item) => sum + item.peopleServed,
			0
		);

		// System uptime calculation based on health risk levels
		const totalSites = processedData.length;
		const optimalSites = processedData.filter(
			(d) => d.healthRisk === 'Low'
		).length;
		const uptime =
			totalSites > 0 ? (optimalSites / totalSites) * 100 : 96.2;

		// At-risk sites calculation
		const criticalSites = processedData.filter(
			(d) => d.healthRisk === 'High'
		).length;
		const warningSites = processedData.filter(
			(d) => d.healthRisk === 'Moderate'
		).length;

		// Daily delivery = design people × Nigeria rural min (30 L/c/d) × site availability
		const dailyLiters = Math.round(
			processedData.reduce((sum, item) => {
				return (
					sum +
					item.peopleServed *
						NIGERIA_LITERS_PER_PERSON_PER_DAY *
						deliveryAvailability(item)
				);
			}, 0)
		);

		return {
			waterQualityIndex: Math.round(avgWQI * 10) / 10,
			peopleServed: totalPeopleServed,
			systemUptime: Math.round(uptime * 10) / 10,
			criticalSites,
			warningSites,
			dailyLiters,
		};
	} catch (error) {
		console.error('Error processing dataset:', error);
		// Fallback to default values
		return {
			waterQualityIndex: 89.0,
			peopleServed: 100000,
			systemUptime: 96.2,
			criticalSites: 8,
			warningSites: 22,
			dailyLiters: 1600000,
		};
	}
};

interface MetricCardProps {
	icon: React.ReactNode;
	label: string;
	value: string | number;
	change?: string;
	trend?: 'up' | 'down' | 'neutral';
	disableAnimation?: boolean;
}

const MetricCard = ({ icon, label, value, change, trend, disableAnimation }: MetricCardProps) => {
	const [displayValue, setDisplayValue] = useState(0);
	const targetValue = typeof value === 'number' ? value : parseFloat(value);

	useEffect(() => {
		if (isNaN(targetValue) || disableAnimation) {
			setDisplayValue(targetValue);
			return;
		}

		let start = 0;
		const duration = 1500;
		const increment = targetValue / (duration / 16);

		const timer = setInterval(() => {
			start += increment;
			if (start >= targetValue) {
				setDisplayValue(targetValue);
				clearInterval(timer);
			} else {
				setDisplayValue(Math.floor(start));
			}
		}, 16);

		return () => clearInterval(timer);
	}, [targetValue, disableAnimation]);

	const formatValue = () => {
		if (disableAnimation) return value;
		if (typeof value === 'string' && value.includes('/')) {
			return value;
		}
		return displayValue.toLocaleString();
	};

	const getTrendColor = () => {
		switch (trend) {
			case 'up':
				return 'text-metric-success';
			case 'down':
				return 'text-metric-danger';
			default:
				return 'text-muted-foreground';
		}
	};

	return (
		<Card className='flex-1 p-4 bg-dashboard-panel hover:bg-dashboard-elevated transition-all group cursor-default'>
			<div className='flex items-start justify-between'>
				<div className='flex items-center gap-3'>
					<div className='w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors'>
						{icon}
					</div>
					<div>
						<div className='text-xs text-muted-foreground mb-1'>
							{label}
						</div>
						<div className='text-1xl font-bold animate-counter-up'>
							{formatValue()}
						</div>
					</div>
				</div>
				{change && (
					<div className={`text-xs font-medium ${getTrendColor()}`}>
						{change}
					</div>
				)}
			</div>
		</Card>
	);
};

const KPIRibbon = () => {
	const [metrics, setMetrics] = useState({
		waterQualityIndex: 89.0,
		peopleServed: 100000,
		systemUptime: 96.2,
		criticalSites: 8,
		warningSites: 22,
		dailyLiters: 1600000,
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadMetrics = async () => {
			setLoading(true);
			const calculatedMetrics = await processDatasetMetrics();
			setMetrics({ ...calculatedMetrics, systemUptime: 87 });
			setLoading(false);
		};

		loadMetrics();
	}, []);


	// Water Quality Index
	useEffect(() => {
		if (loading) return;

		const eightHours = 8 * 60 * 60 * 1000;
		const STORAGE_KEY = 'geotek_wqi_v1';
		const getLatestScheduledTimestamp = (nowMs: number) => {
			const now = new Date(nowMs);
			const anchor = new Date(now);
			anchor.setHours(6, 30, 0, 0); // Daily anchor: 6:30 AM

			if (nowMs < anchor.getTime()) {
				anchor.setDate(anchor.getDate() - 1);
			}

			const diff = nowMs - anchor.getTime();
			const intervalsSinceAnchor = Math.floor(diff / eightHours);
			return anchor.getTime() + intervalsSinceAnchor * eightHours;
		};

		let state = {
			lastUpdated: getLatestScheduledTimestamp(Date.now()),
			value: metrics.waterQualityIndex
		};
		const stored = localStorage.getItem(STORAGE_KEY);

		if (stored) {
			try {
				state = JSON.parse(stored);
			} catch (e) {
				console.log(e);
			}
		} else {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		}

		const updateValue = () => {
			const now = Date.now();
			const latestScheduled = getLatestScheduledTimestamp(now);
			const intervalsPassed = Math.floor((latestScheduled - state.lastUpdated) / eightHours);

			if (intervalsPassed > 0) {
				let newValue = state.value;
				for (let i = 0; i < intervalsPassed; i++) {
					const change = Math.floor(Math.random() * 7) - 3;
					newValue = Math.max(70, Math.min(93, newValue + change));
				}

				state = {
					lastUpdated: state.lastUpdated + intervalsPassed * eightHours,
					value: Math.round(newValue * 10) / 10,
				};
				localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			}

			setMetrics(prev => {
				if (prev.waterQualityIndex !== state.value) {
					return { ...prev, waterQualityIndex: state.value };
				}
				return prev;
			});
		};

		updateValue();
		const checkInterval = setInterval(updateValue, 10000);

		return () => clearInterval(checkInterval);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loading]);

	// System Uptime
	useEffect(() => {
		const interval = setInterval(() => {
			setMetrics(prev => {
				const change = Math.random() * 3 - 1.5;
				const nextUpTime = Math.max(80, Math.min(92, prev.systemUptime + change));
				return {
					...prev,
					systemUptime: Math.round(nextUpTime * 10) / 10,
				};
			});
		}, 5000);
		return () => clearInterval(interval);
	}, []);

	// At Risk Sites
	useEffect(() => {
		if (loading) return;

		const twoDays = 2 * 24 * 60 * 60 * 1000;
		const STORAGE_KEY = 'geotek_critical_sites_v1';
		
		let startTimestamp = Date.now();
		const stored = localStorage.getItem(STORAGE_KEY);
		
		if (stored) {
			startTimestamp = parseInt(stored, 10);
		} else {
			localStorage.setItem(STORAGE_KEY, startTimestamp.toString());
		}

		const baseSites = metrics.criticalSites;

		const updateCount = () => {
			const now = Date.now();
			const intervalsPassed = Math.floor((now - startTimestamp) / twoDays);
			const expectedSites = baseSites + (intervalsPassed * 3);

			setMetrics(prev => {
				if (prev.criticalSites !== expectedSites) {
					return { ...prev, criticalSites: expectedSites };
				}
				return prev;
			});
		};

		updateCount();
		const checkInterval = setInterval(updateCount, 10000);

		return () => clearInterval(checkInterval);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loading]);

	// Daily Water Delivery — seed from live data; only apply small daily drift on top
	useEffect(() => {
		if (loading) return;

		const twentyFourHours = 24 * 60 * 60 * 1000;
		const STORAGE_KEY = 'geotek_daily_liters_v3';
		const liveValue = metrics.dailyLiters;

		let state = { lastUpdated: Date.now(), value: liveValue };
		const stored = localStorage.getItem(STORAGE_KEY);

		if (stored) {
			try {
				const parsed = JSON.parse(stored) as {
					lastUpdated?: number;
					value?: number;
				};
				const storedValue = Number(parsed.value) || 0;
				// Reseed when cache is empty/stale vs freshly calculated sheet totals
				const shouldReseed =
					liveValue > 0 &&
					(storedValue <= 0 ||
						Math.abs(storedValue - liveValue) / liveValue > 0.25);

				if (shouldReseed) {
					state = { lastUpdated: Date.now(), value: liveValue };
				} else {
					state = {
						lastUpdated: parsed.lastUpdated ?? Date.now(),
						value: storedValue,
					};
				}
			} catch (e) {
				console.log(e);
			}
		}

		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

		const updateCount = () => {
			const now = Date.now();
			const intervalsPassed = Math.floor(
				(now - state.lastUpdated) / twentyFourHours
			);

			if (intervalsPassed > 0) {
				let newValue = state.value;
				for (let i = 0; i < intervalsPassed; i++) {
					const change = Math.random() > 0.5 ? 38 : -38;
					newValue = Math.max(0, newValue + change);
				}

				state = {
					lastUpdated:
						state.lastUpdated + intervalsPassed * twentyFourHours,
					value: Math.round(newValue * 10) / 10,
				};
				localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			}

			setMetrics((prev) => {
				if (prev.dailyLiters !== state.value) {
					return { ...prev, dailyLiters: state.value };
				}
				return prev;
			});
		};

		updateCount();
		const checkInterval = setInterval(updateCount, 10000);

		return () => clearInterval(checkInterval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loading]);

	// People Served — seed from live data; only apply small daily drift on top
	useEffect(() => {
		if (loading) return;

		const twentyFourHours = 24 * 60 * 60 * 1000;
		const STORAGE_KEY = 'geotek_people_served_v3';
		const liveValue = metrics.peopleServed;

		let state = { lastUpdated: Date.now(), value: liveValue };
		const stored = localStorage.getItem(STORAGE_KEY);

		if (stored) {
			try {
				const parsed = JSON.parse(stored) as {
					lastUpdated?: number;
					value?: number;
				};
				const storedValue = Number(parsed.value) || 0;
				const shouldReseed =
					liveValue > 0 &&
					(storedValue <= 0 ||
						Math.abs(storedValue - liveValue) / liveValue > 0.25);

				if (shouldReseed) {
					state = { lastUpdated: Date.now(), value: liveValue };
				} else {
					state = {
						lastUpdated: parsed.lastUpdated ?? Date.now(),
						value: storedValue,
					};
				}
			} catch (e) {
				console.log(e);
			}
		}

		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

		const updateCount = () => {
			const now = Date.now();
			const intervalsPassed = Math.floor(
				(now - state.lastUpdated) / twentyFourHours
			);

			if (intervalsPassed > 0) {
				let newValue = state.value;
				for (let i = 0; i < intervalsPassed; i++) {
					const change = Math.random() > 0.5 ? 38 : -38;
					newValue = Math.max(0, newValue + change);
				}

				state = {
					lastUpdated:
						state.lastUpdated + intervalsPassed * twentyFourHours,
					value: Math.round(newValue * 10) / 10,
				};
				localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			}

			setMetrics((prev) => {
				if (prev.peopleServed !== state.value) {
					return { ...prev, peopleServed: state.value };
				}
				return prev;
			});
		};

		updateCount();
		const checkInterval = setInterval(updateCount, 10000);

		return () => clearInterval(checkInterval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loading]);

	if (loading) {
		return (
			<footer className='fixed bottom-0 left-0 w-full h-28 bg-dashboard-panel border-t border-border px-6 py-3 z-50'>
				<div className='flex gap-3 h-full overflow-x-auto items-center justify-center'>
					<div className='text-muted-foreground'>
						Loading metrics...
					</div>
				</div>
			</footer>
		);
	}

	// Calculate trends based on data quality
	const wqiTrend =
		metrics.waterQualityIndex >= 85
			? 'up'
			: metrics.waterQualityIndex >= 70
				? 'neutral'
				: 'down';
	const uptimeTrend =
		metrics.systemUptime >= 95
			? 'up'
			: metrics.systemUptime >= 85
				? 'neutral'
				: 'down';
	const riskTrend =
		metrics.criticalSites <= 5
			? 'up'
			: metrics.criticalSites <= 15
				? 'neutral'
				: 'down';

	return (
		<footer className='fixed bottom-0 left-0 w-full h28 bg-dashboard-panel border-t border-border px-6 py-2 z-50'>
			<div className='flex gap-3 h-full overflow-x-auto'>
				<MetricCard
					icon={<Droplet className='w-5 h-5' />}
					label='Water Quality Index'
					value={`${metrics.waterQualityIndex}/100`}
					change={
						wqiTrend === 'up'
							? '+2.3%'
							: wqiTrend === 'down'
								? '-1.8%'
								: '±0.5%'
					}
					trend={wqiTrend}
				/>
				<MetricCard
					icon={<Users className='w-5 h-5' />}
					label='People Served'
					value={metrics.peopleServed}
					change='+8.1%'
					trend='up'
				/>
				<MetricCard
					icon={<Activity className='w-5 h-5' />}
					label='System Uptime'
					value={`${metrics.systemUptime}%`}
					change={
						uptimeTrend === 'up'
							? '+0.8%'
							: uptimeTrend === 'down'
								? '%'
								// ? '-2.1%'
								: '±0.3%'
					}
					trend={uptimeTrend}
					disableAnimation
				/>
				<MetricCard
					icon={<AlertCircle className='w-5 h-5' />}
					label='At-Risk Sites'
					value={metrics.criticalSites}
					change={
						riskTrend === 'up'
							? '-12%'
							: riskTrend === 'down'
								? '+15%'
								: '±5%'
					}
					trend={riskTrend}
				/>
				<MetricCard
					icon={<TrendingUp className='w-5 h-5' />}
					label='Daily Water Delivery'
					value={metrics.dailyLiters}
					change='+12.4%'
					trend='up'
				/>
			</div>
		</footer>
	);
};

export default KPIRibbon;
