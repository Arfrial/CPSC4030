const fieldExplorerCache = new Map();
let fieldExplorerTimer = null;
let fieldExplorerRequest = 0;

function stopFieldPlayback() {
    clearInterval(fieldExplorerTimer);
    fieldExplorerTimer = null;
}

// Convert compact rows using their declared column names.
function prepareFieldExplorer(raw) {
    const frames = new Map();
    const trackMap = new Map();

    for (const [id, rows] of Object.entries(raw.tracks)) {
        const observations = rows.map(row => ({
            ...Object.fromEntries(raw.columns.map((name, i) => [name, row[i]])),
            track_id: id
        })).filter(d => Number.isFinite(d.x) && Number.isFinite(d.y));

        // Connect only explicitly linked parent/child observations in this track.
        // Do not connect consecutive rows: a lineage can branch during division.
        const byCell = new Map(observations.map(d => [String(d.cell_id), d]));
        const edges = [];
        for (const child of observations) {
            const parent = byCell.get(String(child.parent_id));
            if (parent && parent.frame < child.frame) {
                edges.push({ parent, child });
            }
            if (!frames.has(child.frame)) frames.set(child.frame, []);
            frames.get(child.frame).push(child);
        }
        trackMap.set(id, { observations, edges });
    }
    return { frames, trackMap };
}

async function drawFieldExplorer(track = null) {
    stopFieldPlayback();
    tooltip.style("visibility", "hidden");
    const request = ++fieldExplorerRequest;
    const container = d3.select("#trajectory-chart");
    container.selectAll("*").remove();

    const key = track ? track.field_key : selectedField;
    if (key === "all") {
        container.append("p")
            .attr("class", "placeholder")
            .text("Choose a field of view above, or click a track in the scatterplot to explore its field.");
        return;
    }

    const field = fields.find(d => d.field_key === key);
    if (!field) return;

    container.append("p").attr("class", "placeholder")
        .text("Loading field of view…");

    try {
        if (!fieldExplorerCache.has(key)) {
            const pending = d3.json(DATA_PATH + field.path)
                .then(prepareFieldExplorer);
            fieldExplorerCache.set(key, pending);
        }
        const data = await fieldExplorerCache.get(key);
        // Ignore old requests if the user changes fields during loading.
        if (request !== fieldExplorerRequest) return;
        container.selectAll("*").remove();
        renderFieldExplorer(container, field, data, track);
    } catch (error) {
        fieldExplorerCache.delete(key);
        if (request !== fieldExplorerRequest) return;
        console.error("Field explorer error:", error);
        container.selectAll("*").remove();
        container.append("p").attr("class", "placeholder")
            .text("Unable to load this field. Select another field or reset filters and try again.");
    }
}

function renderFieldExplorer(container, field, data, track) {
    const minFrame = field.start_frame;
    const maxFrame = field.end_frame;
    let frame = track ? Math.max(minFrame, Math.min(maxFrame, track.start_frame)) : minFrame;
    const activeID = track ? String(track.track_id) : null;
    const active = activeID === null ? null : data.trackMap.get(activeID);
    const color = colors[field.cell_line];
    const highlight = "#fbbf24";

    container.append("div").attr("class", "field-explorer-title")
        .text(`${field.cell_line} — ${field.field}` +
            (active ? ` · Track ${activeID}` : ""));

    const controls = container.append("div").attr("class", "field-explorer-controls");
    const play = controls.append("button").attr("type", "button").text("Play");
    const slider = controls.append("input")
        .attr("type", "range")
        .attr("min", minFrame).attr("max", maxFrame).attr("step", 1)
        .attr("aria-label", "Field of view frame");
    const frameLabel = controls.append("span").attr("class", "field-frame-label");
    const status = container.append("div").attr("class", "field-explorer-status");

    const width = 650, height = 480;
    const left = 54, right = 620, top = 18;
    // Common coordinate extent includes every centroid in all 25 fields.
    // Equal pixels-per-unit in both directions; image Y increases downward.
    const bottom = top + (right - left) * 930 / 1250;
    const x = d3.scaleLinear().domain([-10, 1240]).range([left, right]);
    const y = d3.scaleLinear().domain([-10, 920]).range([top, bottom]);
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("role", "group").attr("aria-label", "Spatial cell centroid map");

    svg.append("rect").attr("x", left).attr("y", top)
        .attr("width", right - left).attr("height", bottom - top)
        .attr("fill", "#0b1220").attr("stroke", "#334155");
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${bottom})`)
        .call(d3.axisBottom(x).ticks(6).tickSize(-(bottom - top)).tickFormat(""));
    svg.append("g").attr("class", "grid").attr("transform", `translate(${left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickSize(-(right - left)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${bottom})`)
        .call(d3.axisBottom(x).ticks(6));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${left},0)`)
        .call(d3.axisLeft(y).ticks(5));
    svg.append("text").attr("x", (left + right) / 2).attr("y", height - 7)
        .attr("text-anchor", "middle").attr("fill", "#94a3b8").attr("font-size", 12)
        .text("X position (px)");
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -(top + bottom) / 2)
        .attr("y", 14).attr("text-anchor", "middle").attr("fill", "#94a3b8")
        .attr("font-size", 12).text("Y position (px)");

    // Faint full lineage gives context; brighter segments show elapsed movement.
    const edges = svg.append("g").attr("pointer-events", "none")
        .selectAll("line").data(active ? active.edges : []).join("line")
        .attr("x1", d => x(d.parent.x)).attr("y1", d => y(d.parent.y))
        .attr("x2", d => x(d.child.x)).attr("y2", d => y(d.child.y))
        .attr("stroke", highlight).attr("stroke-width", 1.6)
        .attr("stroke-dasharray", d => d.child.frame - d.parent.frame > 1 ? "4 3" : null);
    const cellLayer = svg.append("g");

    const legend = container.append("div").attr("class", "field-explorer-legend");
    function legendItem(c, text) {
        const item = legend.append("span");
        item.append("span").attr("class", "field-legend-dot").style("background", c);
        item.append("span").text(text);
    }
    legendItem(color, "Cell centroid");
    legendItem("#f472b6", "Division annotated");
    if (active) legendItem(highlight, "Selected lineage");
    container.append("p").attr("class", "field-explorer-status")
        .text(active ? "Faint paths show the full lineage; bright paths show movement up to this frame. Dashed links skip frames." :
            "Dots represent annotated cell centers, not actual cell shapes or microscope imagery.");

    function showFrame() {
        slider.property("value", frame);
        frameLabel.text(`Frame ${frame} / ${maxFrame}`);
        tooltip.style("visibility", "hidden");
        const cells = data.frames.get(frame) || [];
        const activeCount = activeID === null ? 0 : cells.filter(d => d.track_id === activeID).length;
        status.text(`${cells.length} annotated cells` + (active ? ` · ${activeCount} in selected track` : ""));
        edges.attr("stroke-opacity", d => d.child.frame <= frame ? 0.95 : 0.18);
        cellLayer.selectAll("circle")
            .data(cells, d => d.track_id + ":" + d.cell_id)
            .join("circle")
            .attr("cx", d => x(d.x)).attr("cy", d => y(d.y))
            .attr("r", d => d.track_id === activeID ? 5 : 3.4)
            .attr("fill", d => d.track_id === activeID ? highlight : d.division ? "#f472b6" : color)
            .attr("fill-opacity", d => !active || d.track_id === activeID ? 0.95 : 0.45)
            .attr("stroke", d => d.division ? "#f472b6" : d.track_id === activeID ? "#ffffff" : "none")
            .attr("stroke-width", d => d.division ? 1.6 : 1)
            .style("cursor", "crosshair")
            .on("mouseenter mousemove", function(event, d) {
                tooltip.style("visibility", "visible")
                    .style("left", `${event.pageX + 15}px`).style("top", `${event.pageY + 15}px`)
                    .html(`<strong>${field.cell_line} · ${field.field}</strong><br>` +
                        `Frame: ${d.frame}<br>Track: ${d.track_id}<br>Cell: ${d.cell_id}<br>` +
                        `Position: (${d.x.toFixed(1)}, ${d.y.toFixed(1)}) px<br>` +
                        `Displacement: ${Number.isFinite(d.displacement) ? d.displacement.toFixed(2) + " px" : "Not available"}<br>` +
                        `Behavior: ${d.lifecycle || "Unknown"}<br>Division: ${d.division ? "Yes" : "No"}`);
            })
            .on("mouseleave", () => tooltip.style("visibility", "hidden"));
    }

    function pause() {
        stopFieldPlayback();
        play.text("Play");
    }
    slider.on("input", function() {
        pause();
        frame = Number(this.value);
        showFrame();
    });
    play.on("click", function() {
        if (fieldExplorerTimer !== null) {
            pause();
            return;
        }
        if (frame >= maxFrame) { frame = minFrame; showFrame(); }
        play.text("Pause");
        // Playback is a visualization speed, not the source recording interval.
        fieldExplorerTimer = setInterval(() => {
            if (frame >= maxFrame) { pause(); return; }
            frame += 1;
            showFrame();
            if (frame >= maxFrame) pause();
        }, 120);
    });
    showFrame();
}
