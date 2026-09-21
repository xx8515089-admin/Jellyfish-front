import { useLayoutEffect, useRef } from 'react'
import { init, use } from 'echarts/core'
import type { ComposeOption, EChartsType } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import { AriaComponent, GridComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import type { AriaComponentOption, GridComponentOption, TitleComponentOption, TooltipComponentOption } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, TitleComponent, AriaComponent, SVGRenderer])
export type EfficiencyChartOption = ComposeOption<LineSeriesOption | BarSeriesOption | PieSeriesOption | GridComponentOption | TooltipComponentOption | TitleComponentOption | AriaComponentOption>

/** Read ECharts' tooltip point index without trusting display names as record identities. */
export function chartDataIndex(params: unknown): number {
  const point = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined
  return point?.dataIndex ?? -1
}

/** Own the library instance, responsive sizing, updated handlers and unmount cleanup. */
export function EfficiencyChart({ option, label, className = '', onDatumClick }: { option: EfficiencyChartOption; label: string; className?: string; onDatumClick?: (index: number) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<EChartsType>()
  const current = useRef({ option, onDatumClick })
  current.current = { option, onDatumClick }
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    let frame = 0
    // Defer initialization for hidden containers; the observer creates the chart when visible.
    const resize = () => {
      if (!element.clientWidth || !element.clientHeight) return
      if (!instance.current) {
        const chart = init(element, undefined, { renderer: 'svg' })
        instance.current = chart
        chart.on('click', (event) => {
          if (event.componentType === 'series' && typeof event.dataIndex === 'number') current.current.onDatumClick?.(event.dataIndex)
        })
        chart.setOption(current.current.option, { notMerge: true })
      } else instance.current.resize()
    }
    resize()
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(resize)
    })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); instance.current?.dispose(); instance.current = undefined }
  }, [])
  useLayoutEffect(() => { instance.current?.setOption(option, { notMerge: true }) }, [option])
  return <div ref={container} className={`efficiency-echart ${className}`} role="img" aria-label={label} />
}
