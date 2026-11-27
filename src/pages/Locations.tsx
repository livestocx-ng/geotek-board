import { useEffect, useMemo, useState } from 'react';
import {
	Search,
	MapPinned,
	Loader2,
	ChevronLeft,
	ChevronRight,
	Filter,
	X,
} from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { WaterSite } from '@/data/water-sites';
import { fetchMonitorSites } from '@/lib/monitor-dataset';

const PAGE_SIZE = 25;

interface LocationRow {
	id: string;
	state: string;
	latitude: number;
	longitude: number;
	community: string;
}

const toLocationRows = (sites: WaterSite[]): LocationRow[] =>
	sites
		.filter((site) => {
			const [lng, lat] = site.coordinates;
			return (
				Number.isFinite(lat) &&
				Number.isFinite(lng) &&
				(lat !== 0 || lng !== 0)
			);
		})
		.map((site) => ({
			id: site.id,
			state: site.state,
			latitude: site.coordinates[1],
			longitude: site.coordinates[0],
			community: site.community?.trim() || '—',
		}));

const formatCoord = (value: number) => value.toFixed(6);

const Locations = () => {
	const [rows, setRows] = useState<LocationRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [stateFilter, setStateFilter] = useState<string>('all');
	const [page, setPage] = useState(1);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				setLoading(true);
				setError(null);
				const sites = await fetchMonitorSites();
				if (cancelled) return;
				setRows(toLocationRows(sites));
			} catch (err) {
				console.error('Failed to load locations:', err);
				if (!cancelled) {
					setError('Unable to load location data. Please try again.');
					setRows([]);
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

	const states = useMemo(
		() =>
			Array.from(new Set(rows.map((r) => r.state).filter(Boolean))).sort(
				(a, b) => a.localeCompare(b)
			),
		[rows]
	);

	const filteredRows = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();

		return rows.filter((row) => {
			if (stateFilter !== 'all' && row.state !== stateFilter) return false;
			if (!query) return true;

			return (
				row.state.toLowerCase().includes(query) ||
				row.community.toLowerCase().includes(query) ||
				String(row.latitude).includes(query) ||
				String(row.longitude).includes(query)
			);
		});
	}, [rows, searchQuery, stateFilter]);

	const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);

	const pageRows = useMemo(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return filteredRows.slice(start, start + PAGE_SIZE);
	}, [filteredRows, currentPage]);

	useEffect(() => {
		setPage(1);
	}, [searchQuery, stateFilter]);

	const rangeStart =
		filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
	const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredRows.length);
	const hasActiveFilters = searchQuery.trim() !== '' || stateFilter !== 'all';

	const clearFilters = () => {
		setSearchQuery('');
		setStateFilter('all');
	};

	return (
		<div className='min-h-screen relative flex flex-col text-foreground overflow-x-hidden'>
			{/* Atmosphere */}
			<div
				aria-hidden
				className='pointer-events-none absolute inset-0 -z-10 bg-[hsl(var(--dashboard-bg))]'
			/>
			<div
				aria-hidden
				className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_at_top,_hsl(var(--water-primary)/0.12),_transparent_60%),linear-gradient(180deg,_hsl(var(--water-light)/0.08),_transparent_70%)]'
			/>
			<div
				aria-hidden
				className='pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(hsl(var(--border)/0.5)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.5)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]'
			/>

			<DashboardHeader
				showStateNav={false}
				onToggleStateNav={() => {}}
				selectedState={''}
			/>

			<main className='flex-1 pt-20 pb-14 px-4 sm:px-6 lg:px-8'>
				<div className='max-w-7xl mx-auto space-y-8'>
					{/* Hero header */}
					<section className='flex flex-col gap-6 md:flex-row md:items-end md:justify-between'>
						<div className='space-y-3 max-w-2xl'>
							<p className='text-xs font-semibold uppercase tracking-[0.18em] text-water-primary'>
								Dataset directory
							</p>
							<h1 className='text-3xl md:text-4xl font-bold tracking-tight text-blue-950'>
								Site Locations
							</h1>
							<p className='text-base text-muted-foreground leading-relaxed'>
								Every water point in the live GEOTEK monitor
								sheet — state, latitude, longitude, and
								community address — ready to scan and share.
							</p>
						</div>

						<div className='flex flex-wrap gap-3'>
							<div className='rounded-2xl border border-border/80 bg-white/80 backdrop-blur-sm px-4 py-3 min-w-[120px] shadow-sm'>
								<p className='text-[11px] uppercase tracking-wider text-muted-foreground'>
									Locations
								</p>
								<p className='text-2xl font-semibold tabular-nums text-blue-950'>
									{loading
										? '—'
										: filteredRows.length.toLocaleString()}
								</p>
							</div>
							<div className='rounded-2xl border border-border/80 bg-white/80 backdrop-blur-sm px-4 py-3 min-w-[120px] shadow-sm'>
								<p className='text-[11px] uppercase tracking-wider text-muted-foreground'>
									States
								</p>
								<p className='text-2xl font-semibold tabular-nums text-blue-950'>
									{loading
										? '—'
										: (stateFilter === 'all'
												? states.length
												: 1
										  ).toLocaleString()}
								</p>
							</div>
						</div>
					</section>

					{/* Data shell */}
					<section className='rounded-3xl border border-border/70 bg-white/90 backdrop-blur-md shadow-[0_20px_50px_-28px_rgba(15,23,42,0.35)] overflow-hidden'>
						{/* Toolbar */}
						<div className='border-b border-border/70 bg-gradient-to-r from-slate-50/90 to-white px-4 sm:px-5 py-4'>
							<div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
								<div className='relative flex-1'>
									<Search className='absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
									<Input
										type='search'
										placeholder='Search state, community, or coordinates…'
										value={searchQuery}
										onChange={(e) =>
											setSearchQuery(e.target.value)
										}
										className='pl-10 h-11 rounded-xl border-border/80 bg-white shadow-sm focus-visible:ring-water-primary/30'
									/>
								</div>

								<div className='flex flex-col sm:flex-row gap-3 sm:items-center'>
									<Select
										value={stateFilter}
										onValueChange={setStateFilter}
									>
										<SelectTrigger className='h-11 w-full sm:w-52 rounded-xl border-border/80 bg-white shadow-sm'>
											<div className='flex items-center gap-2 truncate'>
												<Filter className='w-4 h-4 shrink-0 text-muted-foreground' />
												<SelectValue placeholder='All states' />
											</div>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='all'>
												All states
											</SelectItem>
											{states.map((state) => (
												<SelectItem
													key={state}
													value={state}
												>
													{state}
												</SelectItem>
											))}
										</SelectContent>
									</Select>

									{hasActiveFilters && (
										<Button
											variant='ghost'
											size='sm'
											onClick={clearFilters}
											className='h-11 rounded-xl text-muted-foreground hover:text-foreground'
										>
											<X className='w-4 h-4 mr-1' />
											Clear
										</Button>
									)}
								</div>
							</div>

							{hasActiveFilters && !loading && (
								<div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
									<span>Active filters:</span>
									{searchQuery.trim() && (
										<span className='inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-800 border border-sky-100 px-2.5 py-1'>
											“{searchQuery.trim()}”
										</span>
									)}
									{stateFilter !== 'all' && (
										<span className='inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-800 border border-sky-100 px-2.5 py-1'>
											{stateFilter}
										</span>
									)}
								</div>
							)}
						</div>

						{/* Body */}
						{loading && (
							<div className='flex flex-col items-center justify-center gap-3 py-28 text-sm text-muted-foreground'>
								<div className='relative'>
									<div className='absolute inset-0 rounded-full bg-sky-400/20 blur-xl' />
									<Loader2 className='relative w-8 h-8 animate-spin text-water-primary' />
								</div>
								<p>Loading live location dataset…</p>
							</div>
						)}

						{!loading && error && (
							<div className='py-28 px-6 text-center space-y-3'>
								<div className='mx-auto w-12 h-12 rounded-2xl bg-red-50 text-metric-danger flex items-center justify-center'>
									<MapPinned className='w-6 h-6' />
								</div>
								<p className='text-metric-danger font-medium'>
									{error}
								</p>
								<p className='text-sm text-muted-foreground max-w-md mx-auto'>
									Check your connection and refresh the page
									to try again.
								</p>
							</div>
						)}

						{!loading && !error && filteredRows.length === 0 && (
							<div className='py-28 px-6 text-center space-y-3'>
								<div className='mx-auto w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center'>
									<Search className='w-6 h-6' />
								</div>
								<p className='font-medium text-blue-950'>
									No locations match
								</p>
								<p className='text-sm text-muted-foreground max-w-md mx-auto'>
									Adjust your search or clear filters to see
									the full directory.
								</p>
								{hasActiveFilters && (
									<Button
										variant='outline'
										size='sm'
										onClick={clearFilters}
										className='mt-2 rounded-xl'
									>
										Reset filters
									</Button>
								)}
							</div>
						)}

						{!loading && !error && filteredRows.length > 0 && (
							<>
								<div className='overflow-auto max-h-[min(68vh,740px)]'>
									<Table>
										<TableHeader className='sticky top-0 z-10 bg-white/95 backdrop-blur-sm'>
											<TableRow className='hover:bg-transparent border-border/60'>
												<TableHead className='w-14 text-center text-[11px] uppercase tracking-wider'>
													#
												</TableHead>
												<TableHead className='min-w-[130px] text-[11px] uppercase tracking-wider'>
													State
												</TableHead>
												<TableHead className='min-w-[140px] text-[11px] uppercase tracking-wider'>
													Latitude
												</TableHead>
												<TableHead className='min-w-[140px] text-[11px] uppercase tracking-wider'>
													Longitude
												</TableHead>
												<TableHead className='min-w-[280px] text-[11px] uppercase tracking-wider'>
													Community
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{pageRows.map((row, index) => (
												<TableRow
													key={row.id}
													className='group border-border/50 hover:bg-sky-50/50 transition-colors'
												>
													<TableCell className='text-center text-muted-foreground/80 tabular-nums text-xs'>
														{rangeStart + index}
													</TableCell>
													<TableCell>
														<span className='inline-flex items-center rounded-full bg-slate-100 text-slate-800 border border-slate-200/80 px-2.5 py-1 text-xs font-medium whitespace-nowrap'>
															{row.state}
														</span>
													</TableCell>
													<TableCell className='font-mono text-xs sm:text-[13px] tabular-nums text-slate-700'>
														{formatCoord(
															row.latitude
														)}
													</TableCell>
													<TableCell className='font-mono text-xs sm:text-[13px] tabular-nums text-slate-700'>
														{formatCoord(
															row.longitude
														)}
													</TableCell>
													<TableCell className='text-sm leading-relaxed text-slate-800 max-w-xl'>
														{row.community}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>

								{/* Footer */}
								<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border/70 px-4 sm:px-5 py-3.5 bg-slate-50/80'>
									<p className='text-sm text-muted-foreground'>
										Showing{' '}
										<span className='font-semibold text-foreground tabular-nums'>
											{rangeStart}–{rangeEnd}
										</span>{' '}
										of{' '}
										<span className='font-semibold text-foreground tabular-nums'>
											{filteredRows.length.toLocaleString()}
										</span>
									</p>

									<div className='flex items-center gap-2'>
										<Button
											variant='outline'
											size='sm'
											disabled={currentPage <= 1}
											onClick={() =>
												setPage((p) =>
													Math.max(1, p - 1)
												)
											}
											className='rounded-xl h-9'
										>
											<ChevronLeft className='w-4 h-4' />
											<span className='hidden sm:inline'>
												Previous
											</span>
										</Button>
										<span className='text-sm tabular-nums min-w-[6rem] text-center font-medium text-slate-700'>
											{currentPage} / {totalPages}
										</span>
										<Button
											variant='outline'
											size='sm'
											disabled={
												currentPage >= totalPages
											}
											onClick={() =>
												setPage((p) =>
													Math.min(
														totalPages,
														p + 1
													)
												)
											}
											className='rounded-xl h-9'
										>
											<span className='hidden sm:inline'>
												Next
											</span>
											<ChevronRight className='w-4 h-4' />
										</Button>
									</div>
								</div>
							</>
						)}
					</section>
				</div>
			</main>
		</div>
	);
};

export default Locations;
