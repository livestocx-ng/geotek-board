import { useEffect, useMemo, useState } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { WaterSite } from '@/data/water-sites';
import {
	fetchMonitorSites,
	type MapFocusLocation,
} from '@/lib/monitor-dataset';

interface StateNavigatorProps {
	selectedState: string | null;
	selectedLocationId?: string | null;
	onSelectLocation: (location: MapFocusLocation) => void;
	showStateNav?: boolean;
}

const hasValidCoords = (site: WaterSite) => {
	const [lng, lat] = site.coordinates;
	return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
};

const locationLabel = (site: WaterSite) =>
	site.community?.trim() || site.name;

const StateNavigator = ({
	selectedState,
	selectedLocationId = null,
	onSelectLocation,
	showStateNav = false,
}: StateNavigatorProps) => {
	const [searchTerm, setSearchTerm] = useState('');
	const [sites, setSites] = useState<WaterSite[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [openStates, setOpenStates] = useState<string[]>([]);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				setLoading(true);
				setError(null);
				const data = await fetchMonitorSites();
				if (cancelled) return;
				setSites(data.filter(hasValidCoords));
			} catch (err) {
				console.error('Failed to load monitor sites:', err);
				if (!cancelled) {
					setError('Failed to load locations');
					setSites([]);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	const groupedByState = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		const groups = new Map<string, WaterSite[]>();

		for (const site of sites) {
			const state = site.state?.trim();
			if (!state) continue;

			if (query) {
				const matchesState = state.toLowerCase().includes(query);
				const matchesCommunity = locationLabel(site)
					.toLowerCase()
					.includes(query);
				if (!matchesState && !matchesCommunity) continue;
			}

			const list = groups.get(state) ?? [];
			list.push(site);
			groups.set(state, list);
		}

		return Array.from(groups.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([state, locations]) => ({ state, locations }));
	}, [sites, searchTerm]);

	// Auto-expand matching states while searching
	useEffect(() => {
		if (searchTerm.trim()) {
			setOpenStates(groupedByState.map((g) => g.state));
		}
	}, [searchTerm, groupedByState]);

	// Keep the selected state's accordion open
	useEffect(() => {
		if (selectedState && !openStates.includes(selectedState)) {
			setOpenStates((prev) => [...prev, selectedState]);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedState]);

	const handleLocationClick = (site: WaterSite) => {
		onSelectLocation({
			id: site.id,
			lat: site.coordinates[1],
			lng: site.coordinates[0],
			state: site.state,
		});
	};

	return (
		<aside
			className={cn(
				`flex flex-col border-r border-border bg-white
         transition-transform duration-300 ease-in-out
         ${
			showStateNav
				? 'translate-x-0'
				: '-translate-x-full md:translate-x-0'
		}
         absolute md:relative top-16 left-0 z-30 md:z-auto
         w-full md:w-72 h-[calc(100vh-4rem)] md:h-screen`
			)}
		>
			<div className='p-4 border-b border-border'>
				<h2 className='text-lg font-semibold mb-3'>State Navigator</h2>
				<div className='relative'>
					<Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
					<Input
						placeholder='Search states or locations...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className='pl-9 bg-background/50'
					/>
				</div>
			</div>

			<div className='flex-1 h-full overflow-auto pb-40'>
				{loading && (
					<div className='flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground'>
						<Loader2 className='w-4 h-4 animate-spin' />
						Loading locations...
					</div>
				)}

				{!loading && error && (
					<div className='p-4 text-sm text-metric-danger'>{error}</div>
				)}

				{!loading && !error && groupedByState.length === 0 && (
					<div className='p-4 text-sm text-muted-foreground'>
						No locations found.
					</div>
				)}

				{!loading && !error && groupedByState.length > 0 && (
					<Accordion
						type='multiple'
						value={openStates}
						onValueChange={setOpenStates}
						className='px-2 pb-24'
					>
						{groupedByState.map(({ state, locations }) => (
							<AccordionItem
								key={state}
								value={state}
								className='border-b border-border'
							>
								<AccordionTrigger
									className={cn(
										'px-2 py-3 text-sm hover:no-underline',
										selectedState === state &&
											'text-primary'
									)}
								>
									<span className='flex items-center gap-2 min-w-0'>
										<span className='truncate font-medium'>
											{state}
										</span>
										<Badge
											variant='outline'
											className='text-[10px] shrink-0'
										>
											{locations.length}
										</Badge>
									</span>
								</AccordionTrigger>
								<AccordionContent className='pb-2'>
									<div className='space-y-1'>
										{locations.map((site) => (
											<button
												key={site.id}
												type='button'
												onClick={() =>
													handleLocationClick(site)
												}
												className={cn(
													'w-full flex items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-dashboard-elevated',
													selectedLocationId ===
														site.id &&
														'bg-dashboard-elevated ring-1 ring-primary/50'
												)}
											>
												<MapPin className='w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground' />
												<span className='leading-snug text-foreground/90'>
													{locationLabel(site)}
												</span>
											</button>
										))}
									</div>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				)}
			</div>
		</aside>
	);
};

export default StateNavigator;
