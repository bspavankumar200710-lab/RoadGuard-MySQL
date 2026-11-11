import * as d3 from 'd3';
import { RoadHazardRecord } from '../types/detection';
import { MunicipalCluster } from './municipalClusterService';

export interface HeatmapConfig {
  bandwidth: number; // 20 - 90 px
  colorScheme: 'inferno' | 'turbo' | 'flame' | 'plasma';
  opacity: number; // 0.2 - 0.95
  weightBySeverity: boolean;
  showCentroidBadges: boolean;
  showContours: boolean;
}

export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
  bandwidth: 45,
  colorScheme: 'inferno',
  opacity: 0.72,
  weightBySeverity: true,
  showCentroidBadges: true,
  showContours: true,
};

/**
 * Custom Google Maps OverlayView using D3.js to render
 * mathematical 2D density contour heatmaps and municipal hotspot clusters.
 */
export class D3HazardHeatmapOverlay {
  private overlay: google.maps.OverlayView;
  private container: HTMLDivElement | null = null;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private hazards: RoadHazardRecord[] = [];
  private clusters: MunicipalCluster[] = [];
  private config: HeatmapConfig = { ...DEFAULT_HEATMAP_CONFIG };
  private onClusterClick?: (cluster: MunicipalCluster) => void;

  constructor(
    hazards: RoadHazardRecord[] = [],
    clusters: MunicipalCluster[] = [],
    config: Partial<HeatmapConfig> = {},
    onClusterClick?: (cluster: MunicipalCluster) => void
  ) {
    this.hazards = hazards;
    this.clusters = clusters;
    this.config = { ...DEFAULT_HEATMAP_CONFIG, ...config };
    this.onClusterClick = onClusterClick;

    // Dynamically instantiate OverlayView when Google Maps API is ready
    this.overlay = new google.maps.OverlayView();
    this.overlay.onAdd = () => this.onAdd();
    this.overlay.draw = () => this.draw();
    this.overlay.onRemove = () => this.onRemove();
  }

  public setMap(map: google.maps.Map | null): void {
    this.overlay.setMap(map);
  }

  public getMap(): google.maps.Map | google.maps.StreetViewPanorama | null {
    return this.overlay.getMap() ?? null;
  }

  public getPanes(): google.maps.MapPanes | null {
    return this.overlay.getPanes() ?? null;
  }

  public getProjection(): google.maps.MapCanvasProjection | null {
    return this.overlay.getProjection() ?? null;
  }

  public updateData(hazards: RoadHazardRecord[], clusters: MunicipalCluster[]) {
    this.hazards = hazards;
    this.clusters = clusters;
    this.draw();
  }

  public updateConfig(newConfig: Partial<HeatmapConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.draw();
  }

  /**
   * Called when overlay is added to map
   */
  public onAdd(): void {
    const panes = this.getPanes();
    if (!panes) return;

    this.container = document.createElement('div');
    this.container.className = 'd3-hazard-heatmap-container';
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '35';

    // Create D3 SVG Element
    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('class', 'd3-heatmap-svg')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0')
      .style('overflow', 'visible')
      .style('pointer-events', 'none');

    // Add SVG defs for glowing radial gradients and filters
    const defs = this.svg.append('defs');

    // Soft Gaussian blur for organic municipal heat propagation
    const filter = defs.append('filter').attr('id', 'd3-heatmap-blur');
    filter.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    panes.overlayLayer.appendChild(this.container);
  }

  /**
   * Called whenever map pans, zooms, or redraws
   */
  public draw(): void {
    if (!this.container || !this.svg) return;

    const projection = this.getProjection();
    if (!projection) return;

    // Filter valid hazards with geographic coordinates
    const validHazards = this.hazards.filter(
      (h) => h.latitude != null && h.longitude != null && !isNaN(h.latitude) && !isNaN(h.longitude)
    );

    if (validHazards.length === 0) {
      this.svg.selectAll('*').remove();
      return;
    }

    // Convert geographic coordinates to OverlayView div pixel offsets
    const points: { x: number; y: number; weight: number; severity: string; hazard: RoadHazardRecord }[] = [];

    for (const h of validHazards) {
      const latLng = new google.maps.LatLng(h.latitude!, h.longitude!);
      const pixel = projection.fromLatLngToDivPixel(latLng);
      if (!pixel) continue;

      let weight = 1.0;
      if (this.config.weightBySeverity) {
        if (h.severity === 'high') weight = 4.0;
        else if (h.severity === 'medium') weight = 2.2;
        else weight = 1.0;
      }

      points.push({
        x: pixel.x,
        y: pixel.y,
        weight,
        severity: h.severity,
        hazard: h,
      });
    }

    if (points.length === 0) {
      this.svg.selectAll('*').remove();
      return;
    }

    // Determine bounding dimensions for D3 contour calculation
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const pad = Math.max(120, this.config.bandwidth * 2);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;

    const width = Math.max(300, maxX - minX);
    const height = Math.max(300, maxY - minY);

    // Clear previous drawing
    this.svg.selectAll('g.d3-heatmap-content').remove();
    const g = this.svg.append('g').attr('class', 'd3-heatmap-content');

    // 1. D3 2D Density Contours Generator
    if (this.config.showContours && points.length >= 2) {
      try {
        const density = d3
          .contourDensity<{ x: number; y: number; weight: number }>()
          .x((d) => d.x)
          .y((d) => d.y)
          .weight((d) => d.weight)
          .size([maxX + pad, maxY + pad])
          .bandwidth(this.config.bandwidth)
          .thresholds(22);

        const contours = density(points);
        const maxVal = d3.max(contours, (c) => c.value) || 0.005;

        // Color Interpolator
        const interpolator =
          this.config.colorScheme === 'turbo'
            ? d3.interpolateTurbo
            : this.config.colorScheme === 'plasma'
            ? d3.interpolatePlasma
            : this.config.colorScheme === 'flame'
            ? d3.interpolateYlOrRd
            : d3.interpolateInferno;

        const colorScale = d3.scaleSequential([0, maxVal], interpolator);
        const pathGen = d3.geoPath();

        // Render D3 Iso-Density Filled Polygons
        g.append('g')
          .attr('class', 'contours-layer')
          .selectAll('path')
          .data(contours)
          .enter()
          .append('path')
          .attr('d', pathGen)
          .attr('fill', (d) => colorScale(d.value))
          .attr('fill-opacity', (d) => {
            const ratio = d.value / maxVal;
            return Math.min(0.9, Math.max(0.15, ratio * this.config.opacity * 1.1));
          })
          .attr('stroke', (d) => colorScale(d.value))
          .attr('stroke-width', 0.6)
          .attr('stroke-opacity', 0.5)
          .style('mix-blend-mode', 'screen');
      } catch (err) {
        console.warn('D3 contour calculation note:', err);
      }
    }

    // 2. High-Density Centroid Heat Radial Glows
    const glowGroup = g.append('g').attr('class', 'radial-glow-layer');

    for (const p of points) {
      const radius =
        p.severity === 'high'
          ? this.config.bandwidth * 0.95
          : p.severity === 'medium'
          ? this.config.bandwidth * 0.75
          : this.config.bandwidth * 0.55;

      const fillColor =
        p.severity === 'high' ? '#ef4444' : p.severity === 'medium' ? '#f97316' : '#10b981';

      glowGroup
        .append('circle')
        .attr('cx', p.x)
        .attr('cy', p.y)
        .attr('r', radius)
        .attr('fill', fillColor)
        .attr('fill-opacity', p.severity === 'high' ? 0.32 : 0.22)
        .style('filter', 'url(#d3-heatmap-blur)')
        .style('mix-blend-mode', 'screen');
    }

    // 3. Municipal Problem Cluster Centroid Badges & Action Labels
    if (this.config.showCentroidBadges && this.clusters.length > 0) {
      const badgesGroup = g.append('g').attr('class', 'cluster-badges-layer').style('pointer-events', 'auto');

      for (const cluster of this.clusters) {
        const clusterLatLng = new google.maps.LatLng(cluster.centerLat, cluster.centerLng);
        const cp = projection.fromLatLngToDivPixel(clusterLatLng);
        if (!cp) continue;

        // Distinct styling based on Municipal Priority
        const isCritical = cluster.priority === 'P1_CRITICAL';
        const isElevated = cluster.priority === 'P2_ELEVATED';

        const strokeColor = isCritical ? '#f43f5e' : isElevated ? '#f59e0b' : '#10b981';
        const bgColor = isCritical ? '#881337' : isElevated ? '#78350f' : '#064e3b';
        const textColor = '#ffffff';

        // Centroid Pulsing Radar Ring for P1 Critical Areas
        if (isCritical) {
          badgesGroup
            .append('circle')
            .attr('cx', cp.x)
            .attr('cy', cp.y)
            .attr('r', 28)
            .attr('fill', 'none')
            .attr('stroke', strokeColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,3')
            .attr('opacity', 0.8)
            .append('animate')
            .attr('attributeName', 'r')
            .attr('values', '18;45;18')
            .attr('dur', '2.8s')
            .attr('repeatCount', 'indefinite');
        }

        // Clickable Municipal Problem Area Centroid Group
        const centroidNode = badgesGroup
          .append('g')
          .attr('class', 'cluster-centroid-node')
          .attr('transform', `translate(${cp.x}, ${cp.y})`)
          .style('cursor', 'pointer');

        // Main centroid disc
        centroidNode
          .append('circle')
          .attr('r', 16)
          .attr('fill', bgColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', 2.5)
          .style('filter', 'drop-shadow(0 2px 5px rgba(0,0,0,0.6))');

        // Hazard count inside circle
        centroidNode
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', 4.5)
          .attr('fill', textColor)
          .attr('font-size', '11px')
          .attr('font-weight', '900')
          .attr('font-family', 'sans-serif')
          .text(cluster.totalHazards);

        // Problem Area Name & Priority Pill underneath
        const textWidth = Math.max(90, cluster.name.length * 6.5 + 24);
        const labelGroup = centroidNode.append('g').attr('transform', 'translate(0, 24)');

        labelGroup
          .append('rect')
          .attr('x', -textWidth / 2)
          .attr('y', 0)
          .attr('width', textWidth)
          .attr('height', 18)
          .attr('rx', 9)
          .attr('fill', '#0f172a')
          .attr('fill-opacity', 0.92)
          .attr('stroke', strokeColor)
          .attr('stroke-width', 1.2)
          .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))');

        labelGroup
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('y', 12.5)
          .attr('fill', '#ffffff')
          .attr('font-size', '9.5px')
          .attr('font-weight', '700')
          .attr('font-family', 'sans-serif')
          .text(`${cluster.priority === 'P1_CRITICAL' ? '🚨 ' : ''}${cluster.name}`);

        // Click interaction
        if (this.onClusterClick) {
          centroidNode.on('click', () => {
            this.onClusterClick!(cluster);
          });
        }
      }
    }
  }

  /**
   * Called when overlay is removed from map
   */
  public onRemove(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
      this.svg = null;
    }
  }
}
