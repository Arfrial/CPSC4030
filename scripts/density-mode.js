// CellScope: hexagonal track-density view.
// Load before script.js. Uses the existing D3 v7 library and dashboard state.
let trackDisplayMode = "scatter";

// Assign each track to its closest center on a regular hexagonal lattice.
function makeTrackHexbins(data, x, y, left, top, radius) {
    const dx = Math.sqrt(3) * radius;
    const dy = 1.5 * radius;
    const bins = new Map();

    for (const track of data) {
        const px = x(track.duration) - left;
        const py = y(track.mean_displacement) - top;
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        const row = Math.round(py / dy);
        let best = null;
        let distance = Infinity;

        for (let r = row - 1; r <= row + 1; r++) {
            const offset = (r & 1) * dx / 2;
            const c = Math.round((px - offset) / dx);
            const cx = c * dx + offset;
            const cy = r * dy;
            const squared = (px - cx) ** 2 + (py - cy) ** 2;
            if (squared < distance) {
                distance = squared;
                best = { key: `${r}:${c}`, x: cx + left, y: cy + top };
            }
        }
        if (!bins.has(best.key)) bins.set(best.key, { ...best, tracks: [] });
        bins.get(best.key).tracks.push(track);
    }
    return [...bins.values()];
}

function drawTrackExplorer() {
    if (trackDisplayMode === "density") drawDensityChart();
    else drawScatterChart();
}

function drawDensityChart() {
    const container = d3.select("#scatter-chart");
    container.selectAll("*").remove();
    container.style("flex-direction", "column");
    selectedTrack = null;
    selectedTrackKeys = null;
    d3.select("#track-details").html("");

    const data = getFilteredTracks();
    if (!data.length) {
        container.append("span").attr("class", "placeholder")
            .text("No tracks available.");
        return;
    }

    const width = 1100, height = 420;
    const margin = { top: 20, right: 30, bottom: 55, left: 70 };
    const right = width - margin.right, bottom = height - margin.bottom;
    const radius = 12;
    const x = d3.scaleLinear()
        .domain([0, d3.max(tracks, d => d.duration)]).nice()
        .range([margin.left, right]);
    const y = d3.scaleLinear()
        .domain([0, d3.max(tracks, d => d.mean_displacement)]).nice()
        .range([bottom, margin.top]);
    const bins = makeTrackHexbins(data, x, y, margin.left, margin.top, radius);
    const maxCount = d3.max(bins, d => d.tracks.length) || 1;
    const color = d3.scaleSequentialLog(d3.interpolateRgb("#315f85", "#facc15"))
        .domain([1, Math.max(2, maxCount)]);

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("role", "group")
        .attr("aria-label", "Hexagonal density of cell tracks");

    svg.append("g").attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(7).tickSize(-(right - margin.left)).tickFormat(""));
    svg.append("g").attr("class", "grid")
        .attr("transform", `translate(0,${bottom})`)
        .call(d3.axisBottom(x).ticks(10).tickSize(-(bottom - margin.top)).tickFormat(""));

    svg.append("defs").append("clipPath").attr("id", "track-density-clip")
        .append("rect").attr("x", margin.left).attr("y", margin.top)
        .attr("width", right - margin.left).attr("height", bottom - margin.top);

    // Point-up hexagon; all bins have the same size in chart coordinates.
    const hexPath = "M" + d3.range(6).map(i => {
        const angle = Math.PI / 3 * i - Math.PI / 2;
        return `${radius * Math.cos(angle)},${radius * Math.sin(angle)}`;
    }).join("L") + "Z";

    let activeBin = null;
    const marks = svg.append("g").attr("clip-path", "url(#track-density-clip)")
        .selectAll("path").data(bins, d => d.key).join("path")
        .attr("d", hexPath)
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .attr("fill", d => color(d.tracks.length))
        .attr("stroke", "#1e293b").attr("stroke-width", 0.8)
        .attr("tabindex", 0).attr("role", "button")
        .attr("aria-pressed", "false")
        .attr("aria-label", d => `${d.tracks.length} tracks in this bin. Select to filter histogram and inspect tracks.`)
        .style("cursor", "pointer");

    svg.append("g").attr("class", "axis")
        .attr("transform", `translate(0,${bottom})`).call(d3.axisBottom(x).ticks(10));
    svg.append("g").attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(7));
    svg.append("text").attr("x", (margin.left + right) / 2).attr("y", height - 12)
        .attr("text-anchor", "middle").attr("fill", "#94a3b8").attr("font-size", 13)
        .text("Track duration (frames)");
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", 18)
        .attr("text-anchor", "middle").attr("fill", "#94a3b8").attr("font-size", 13)
        .text("Mean step displacement (px)");

    const legend = container.append("div").attr("class", "density-legend");
    legend.append("span").text(maxCount > 1 ? "Tracks per bin (log color scale)" : "1 track per occupied bin");
    if (maxCount > 1) {
        const scale = legend.append("div").attr("class", "density-scale");
        scale.append("span").text("1");
        scale.append("span").attr("class", "density-gradient");
        scale.append("span").text(maxCount.toLocaleString());
    }
    const status = container.append("div").attr("class", "scatter-status")
        .text(`${data.length.toLocaleString()} tracks in ${bins.length.toLocaleString()} occupied bins`);
    container.append("div").attr("class", "histogram-context")
        .text("Click a hexagon to filter the histogram and inspect its tracks. Click again to clear.");

    // A density bin can contain tracks from different fields of view.
    // Never combine their spatial coordinates into a single field map.
    const inspector = container.append("div")
        .attr("class", "field-explorer-controls")
        .style("display", "none");
    inspector.append("label").attr("for", "density-track-select")
        .text("Inspect a track from this bin");
    const trackPicker = inspector.append("select")
        .attr("id", "density-track-select")
        .style("min-width", "0")
        .style("max-width", "100%");
    let activeTracks = [];

    function inspectTrack(track) {
        selectedTrack = track || null;
        tooltip.style("visibility", "hidden");
        if (track) {
            showTrackDetails(track);
        } else {
            d3.select("#track-details").html("");
            drawFieldExplorer();
        }
    }

    trackPicker.on("change", function() {
        inspectTrack(this.value === "" ? null :
            activeTracks[Number(this.value)]);
    });

    function chooseBin(bin) {
        activeBin = activeBin === bin.key ? null : bin.key;
        selectedTrackKeys = activeBin === null ? null : new Set(bin.tracks.map(d => d.track_key));
        marks.attr("opacity", d => activeBin === null || d.key === activeBin ? 1 : 0.2)
            .attr("stroke", d => d.key === activeBin ? "#ffffff" : "#1e293b")
            .attr("stroke-width", d => d.key === activeBin ? 2 : 0.8)
            .attr("aria-pressed", d => String(d.key === activeBin));
        status.text(activeBin === null
            ? `${data.length.toLocaleString()} tracks in ${bins.length.toLocaleString()} occupied bins`
            : `${bin.tracks.length.toLocaleString()} of ${data.length.toLocaleString()} tracks selected`);
        tooltip.style("visibility", "hidden");
        drawHistogram();

        // Singleton bins immediately open the exact track. For larger bins,
        // offer the individual tracks, identified by cell line and field.
        activeTracks = activeBin === null ? [] : [...bin.tracks].sort((a, b) =>
            String(a.cell_line).localeCompare(String(b.cell_line)) ||
            String(a.field).localeCompare(String(b.field), undefined, { numeric: true }) ||
            String(a.track_id).localeCompare(String(b.track_id), undefined, { numeric: true }));
        trackPicker.selectAll("option").remove();
        inspector.style("display", activeTracks.length ? "flex" : "none");
        if (!activeTracks.length) {
            inspectTrack(null);
            return;
        }
        trackPicker.append("option").attr("value", "")
            .text("Choose a track…");
        trackPicker.selectAll("option.track-option")
            .data(activeTracks).join("option")
            .attr("class", "track-option")
            .attr("value", (d, i) => i)
            .text(d => `${d.cell_line} · ${d.field} · Track ${d.track_id}`);
        if (activeTracks.length === 1) {
            trackPicker.property("value", "0");
            inspectTrack(activeTracks[0]);
        } else {
            trackPicker.property("value", "");
            inspectTrack(null);
        }
    }

    marks.on("mouseenter", function(event, d) {
        let content = `<strong>${d.tracks.length.toLocaleString()} tracks</strong><br>`;
        for (const line of cellLines) {
            const count = d.tracks.filter(t => t.cell_line === line).length;
            if (count) content += `<span style="color:${colors[line]}">${line}</span>: ${count}<br>`;
        }
        content += d.tracks.length === 1
            ? "<em>Click to inspect this track and filter the histogram</em>"
            : "<em>Click to filter the histogram and choose a track</em>";
        tooltip.html(content).style("visibility", "visible")
            .style("left", `${event.pageX + 15}px`).style("top", `${event.pageY + 15}px`);
    }).on("mousemove", event => {
        tooltip.style("left", `${event.pageX + 15}px`).style("top", `${event.pageY + 15}px`);
    }).on("mouseleave", () => tooltip.style("visibility", "hidden"))
      .on("click", (event, d) => chooseBin(d))
      .on("keydown", (event, d) => {
          if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              chooseBin(d);
          }
      });
}

function setTrackDisplayMode(mode) {
    if (trackDisplayMode === mode) return;
    trackDisplayMode = mode;
    d3.select("#scatter-mode").classed("active", mode === "scatter")
        .attr("aria-pressed", String(mode === "scatter"));
    d3.select("#density-mode").classed("active", mode === "density")
        .attr("aria-pressed", String(mode === "density"));
    tooltip.style("visibility", "hidden");
    drawTrackExplorer();
    drawHistogram();
    // Clear any old individual-track trajectory while retaining the global field filter.
    drawFieldExplorer();
}

d3.select("#scatter-mode").attr("aria-pressed", "true")
    .on("click", () => setTrackDisplayMode("scatter"));
d3.select("#density-mode").attr("aria-pressed", "false")
    .on("click", () => setTrackDisplayMode("density"));
