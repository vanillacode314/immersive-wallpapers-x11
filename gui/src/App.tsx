import { createElementSize } from '@solid-primitives/resize-observer'
import { invoke } from '@tauri-apps/api'
import { open } from '@tauri-apps/api/dialog'
import { readBinaryFile } from '@tauri-apps/api/fs'
import { DragGesture, Gesture } from '@use-gesture/vanilla'
import { Component } from 'solid-js'
import z from 'zod'
import { clamp, dpi, getFile, sum } from './utils'

const monitorSchema = z.object({
	name: z.string(),
	physical_width: z.number(),
	physical_height: z.number(),
	pixel_width: z.number(),
	pixel_height: z.number(),
	x: z.number(),
	y: z.number()
})
export type TMonitor = z.infer<typeof monitorSchema>

function App() {
	const [monitors] = createResource(
		async () => monitorSchema.array().parse(await invoke('get_size_cmd')),
		{
			initialValue: []
		}
	)

	let containerRef!: HTMLDivElement
	const containerSize = createElementSize(() => containerRef)
	const totalWidth = () => sum(...monitors().map((monitor) => monitor.pixel_width))
	const maxHeight = () => Math.max(0, ...monitors().map((monitor) => monitor.pixel_height))
	const aspectRatio = () => maxHeight() / totalWidth()
	const minDpi = () => Math.min(...monitors().map(dpi))

	const scale = () => (containerSize.width ?? 0) / totalWidth()
	const [imageOffset, setImageOffset] = createStore({ x: 0, y: 0 })
	const [imageScale, setImageScale] = createSignal<number>(1)
	const [imageSrc, setImageSrc] = createSignal<string>('')
	const [path, setPath] = createSignal<string>('')
	const loadImage = async () => {
		const path = z.string().parse(await open())
		const file = new Blob([await readBinaryFile(path)])
		setImageSrc(URL.createObjectURL(file))
		setPath(path)
	}

	const setWallpaper = async () => {
		if (!path()) return
		await invoke('set_wallpaper_cmd', {
			path: path(),
			scale: imageScale(),
			top: -Math.round(imageOffset.y / scale()),
			left: -Math.round(imageOffset.x / scale())
		})
	}

	return (
		<div>
			<button
				class="bg-black px-5 py-3 text-sm font-bold uppercase tracking-wide text-white"
				onClick={loadImage}
			>
				Load Image
			</button>
			<button
				class="relative z-20 bg-black px-5 py-3 text-sm font-bold uppercase tracking-wide text-white"
				onClick={setWallpaper}
			>
				Set Wallpaper
			</button>
			<div class="container relative mx-auto grid h-full p-5">
				<img
					ref={(el) => {
						const imageSize = createElementSize(() => el)
						const gesture = new Gesture(
							el,
							{
								onDrag({ delta: [ox, oy] }) {
									const boundX = (containerSize.width ?? 0) - (imageSize.width ?? 0) * imageScale()
									const boundY =
										(containerSize.width ?? 0) * aspectRatio() -
										(imageSize.height ?? 0) * imageScale()
									setImageOffset({
										x: clamp(imageOffset.x + ox, boundX, 0),
										y: clamp(imageOffset.y + oy, boundY, 0)
									})
								},
								onWheel({ offset: [ox, oy] }) {
									const boundX = (containerSize.width ?? 0) - (imageSize.width ?? 0) * imageScale()
									const boundY =
										(containerSize.width ?? 0) * aspectRatio() -
										(imageSize.height ?? 0) * imageScale()
									batch(() => {
										setImageOffset({
											x: clamp(imageOffset.x, boundX, 0),
											y: clamp(imageOffset.y, boundY, 0)
										})
										setImageScale(Math.max(1, 1 - oy / 750))
									})
								}
							},
							{}
						)
						onCleanup(() => gesture.destroy())
					}}
					src={imageSrc() || 'https://picsum.photos/1600/900'}
					class="user-select-none absolute m-5 origin-top-left cursor-move"
					draggable={false}
					style={{
						width: (containerSize.width ?? 0) + 'px',
						top: imageOffset.y + 'px',
						left: imageOffset.x + 'px',
						transform: `scale(${imageScale()})`
					}}
				/>
				<Suspense fallback="Loading...">
					<ErrorBoundary fallback="Error...">
						<Show when={monitors()}>
							<div
								class="relative"
								ref={containerRef}
								style={{
									height: maxHeight() * scale() + 'px'
								}}
							>
								<For each={monitors()}>
									{(monitor) => (
										<Monitor
											scale={scale()}
											minDpi={minDpi()}
											monitor={monitor}
											containerSize={containerSize}
											container={containerRef}
										/>
									)}
								</For>
							</div>
						</Show>
					</ErrorBoundary>
				</Suspense>
			</div>
		</div>
	)
}

const Monitor: Component<{
	containerSize: { width: number | null; height: number | null }
	monitor: TMonitor
	scale: number
	minDpi: number
	container: HTMLDivElement
}> = (props) => {
	const width = () => props.monitor.pixel_width * props.scale
	const height = () => props.monitor.pixel_height * props.scale
	const [offset, setOffset] = createStore({ x: 0, y: 0 })

	return (
		<div
			ref={(el) => {
				const gesture = new DragGesture(
					el,
					({ offset: [ox, oy] }) => {
						setOffset('y', oy)
					},
					{
						bounds: props.container
					}
				)
				onCleanup(() => gesture.destroy())
			}}
			class="user-select-none absolute cursor-move border-2 bg-black/50 p-5 text-white"
			style={{
				height: `${height()}px`,
				width: `${width()}px`,
				top: props.monitor.y * props.scale + offset.y + 'px',
				left: props.monitor.x * props.scale + offset.x + 'px'
			}}
		></div>
	)
}

export default App
