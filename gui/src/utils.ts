import { TMonitor } from './App'

export function sum(...values: number[]) {
	return values.reduce((sum, value) => sum + value, 0)
}

export function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}

export function dpi(monitor: TMonitor) {
	return monitor.pixel_height / monitor.physical_height
}

export function aspectRatio(monitor: TMonitor) {
	return monitor.pixel_width / monitor.pixel_height
}

export function getFile(accept: string, raw: false): Promise<string>
export function getFile(accept: string, raw: true): Promise<File>
export function getFile(accept: string = '', raw: boolean = false) {
	return new Promise<string | Blob | null>((resolve) => {
		const inp = document.createElement('input')
		inp.type = 'file'
		if (accept) inp.accept = accept

		inp.onchange = () => {
			const file = inp.files?.[0]
			if (!file) {
				resolve(null)
				return
			}

			if (raw) {
				resolve(file)
			} else {
				file.text().then((text) => {
					resolve(text)
				})
			}
		}

		inp.click()
	})
}
