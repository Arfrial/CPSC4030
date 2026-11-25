
const DATA_PATH = "data/processed/";

const cellLines = [
    "HEK293T",
    "MCF10A",
    "MDA-MB-231",
    "U87"
];

const colors = {
    "HEK293T": "#60a5fa",
    "MCF10A": "#2dd4bf",
    "MDA-MB-231": "#fb923c",
    "U87": "#a78bfa"
};

let fields = [];
let tracks = [];
let frameData = [];

let selectedCellLine = "all";
let selectedField = "all";

const tooltip = d3.select("#tooltip");

// Load processed data

async function loadData() {
    try {
        [fields, tracks, frameData] = await Promise.all([
            d3.csv(DATA_PATH + "fields.csv", d3.autoType),
            d3.csv(DATA_PATH + "tracks.csv", d3.autoType),
            d3.csv(DATA_PATH + "field_frames.csv", d3.autoType)
        ]);

        console.log("Data loaded successfully");
        console.log("Fields:", fields.length);
        console.log("Tracks:", tracks.length);
        console.log("Frame records:", frameData.length);

        updateFieldOptions();
        updateDashboard();

    } catch (error) {
        console.error("Error initializing dashboard:", error);
    }
}

// Return fields matching the current filters

function getFilteredFields() {
    return fields.filter(d =>
        (selectedCellLine === "all" ||
            d.cell_line === selectedCellLine) &&
        (selectedField === "all" ||
            d.field_key === selectedField)
    );
}

// Update field dropdown

function updateFieldOptions() {
    const availableFields = fields.filter(d =>
        selectedCellLine === "all" ||
        d.cell_line === selectedCellLine
    );

    const dropdown = d3.select("#field");

    dropdown.selectAll("option").remove();

    dropdown.append("option")
        .attr("value", "all")
        .text("All Fields");

    dropdown.selectAll("option.field-option")
        .data(availableFields)
        .join("option")
        .attr("class", "field-option")
        .attr("value", d => d.field_key)
        .text(d => `${d.cell_line} - ${d.field}`);

    dropdown.property("value", selectedField);
}

// Update summary cards

function updateStatistics() {
    const filtered = getFilteredFields();

    const observations = d3.sum(
        filtered, d => d.observations
    );

    const trackCount = d3.sum(
        filtered, d => d.tracks
    );

    const lineCount = new Set(
        filtered.map(d => d.cell_line)
    ).size;

    d3.select("#total-observations")
        .text(observations.toLocaleString());

    d3.select("#total-tracks")
        .text(trackCount.toLocaleString());

    d3.select("#total-cell-lines")
        .text(lineCount);

    d3.select("#total-fields")
        .text(filtered.length);
}

// Movement comparison bar chart

function drawBarChart() {
    const container = d3.select("#bar-chart");

    container.selectAll("*").remove();

    const data = cellLines.map(line => {
        const matchingFields = fields.filter(
            d => d.cell_line === line
        );

        const totalDisplacement = d3.sum(
            matchingFields, d => d.sum_displacement
        );

        const validSteps = d3.sum(
            matchingFields, d => d.valid_steps
        );

        return {
            cell_line: line,
            mean: validSteps > 0
                ? totalDisplacement / validSteps
                : 0,
            observations: d3.sum(
                matchingFields, d => d.observations
            )
        };
    });

    const width = 640;
    const height = 320;

    const margin = {
        top: 25,
        right: 20,
        bottom: 50,
        left: 65
    };

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("role", "group")
        .attr("aria-label", "Mean displacement by cell line");

    const x = d3.scaleBand()
        .domain(cellLines)
        .range([margin.left, width - margin.right])
        .padding(0.3);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.mean) * 1.15])
        .nice()
        .range([height - margin.bottom, margin.top]);

    // Horizontal grid lines

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(6)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat("")
        );

    // X axis

    svg.append("g")
        .attr("class", "axis")
        .attr(
            "transform",
            `translate(0,${height - margin.bottom})`
        )
        .call(d3.axisBottom(x));

    // Y axis

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(6));

    // Y axis label

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 12)
        .text("Mean step displacement (px)");

    // Draw bars

    svg.selectAll("rect.bar")
        .data(data)
        .join("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.cell_line))
        .attr("y", d => y(d.mean))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d.mean))
        .attr("rx", 5)
        .attr("fill", d => colors[d.cell_line])
        .attr("opacity", d =>
            selectedCellLine === "all" ||
            selectedCellLine === d.cell_line
                ? 1 : 0.25
        )
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d =>
            `Filter ${d.cell_line}, mean ${d.mean.toFixed(2)} pixels`
        )
        .style("cursor", "pointer")

        .on("mouseenter", function(event, d) {
            d3.select(this)
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1.5);

            tooltip
                .style("visibility", "visible")
                .html(`
                    <strong>${d.cell_line}</strong><br>
                    Mean displacement: ${d.mean.toFixed(2)} px<br>
                    Observations: ${d.observations.toLocaleString()}<br>
                    Click to filter
                `);
        })

        .on("mousemove", function(event) {
            tooltip
                .style("left", `${event.pageX + 15}px`)
                .style("top", `${event.pageY + 15}px`);
        })

        .on("mouseleave", function() {
            d3.select(this).attr("stroke", "none");
            tooltip.style("visibility", "hidden");
        })

        .on("click", function(event, d) {
            selectCellLine(d.cell_line);
        })

        .on("keydown", function(event, d) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectCellLine(d.cell_line);
            }
        });

    // Display values above bars

    svg.selectAll(".bar-label")
        .data(data)
        .join("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.cell_line) + x.bandwidth() / 2)
        .attr("y", d => y(d.mean) - 8)
        .attr("text-anchor", "middle")
        .attr("fill", "#f1f5f9")
        .attr("font-size", 13)
        .text(d => d.mean.toFixed(2));
}

// Select or deselect a cell line by clicking a bar

function selectCellLine(line) {
    selectedCellLine =
        selectedCellLine === line ? "all" : line;

    selectedField = "all";

    d3.select("#cell-line")
        .property("value", selectedCellLine);

    tooltip.style("visibility", "hidden");

    updateFieldOptions();
    updateDashboard();
}


// Movement over time line chart

function drawLineChart() {
    const container = d3.select("#line-chart");
    container.selectAll("*").remove();

    const filtered = frameData.filter(d =>
        (selectedCellLine === "all" ||
            d.cell_line === selectedCellLine) &&
        (selectedField === "all" ||
            d.field_key === selectedField) &&
        d.valid_steps > 0 &&
        Number.isFinite(d.mean_displacement)
    );

    if (filtered.length === 0) {
        container.append("span")
            .attr("class", "placeholder")
            .text("No movement data available.");
        return;
    }

    // Calculate field-balanced averages for each frame

    const grouped = d3.rollups(
        filtered,
        values => ({
            mean: d3.mean(values, d => d.mean_displacement),
            fields: values.length
        }),
        d => d.cell_line,
        d => d.frame
    );

    const minFrame = d3.min(filtered, d => d.frame);
    const maxFrame = d3.max(filtered, d => d.frame);

    const series = grouped.map(([line, frames]) => {
        const frameMap = new Map(frames);

        return {
            cell_line: line,
            values: d3.range(minFrame, maxFrame + 1)
                .map(frame => ({
                    frame: frame,
                    mean: frameMap.get(frame)?.mean ?? null,
                    fields: frameMap.get(frame)?.fields ?? 0
                }))
        };
    });

    const width = 640;
    const height = 320;

    const margin = {
        top: 25,
        right: 20,
        bottom: 50,
        left: 65
    };

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("role", "img")
        .attr("aria-label", "Cell movement over time");

    // Scales

    const x = d3.scaleLinear()
        .domain([minFrame, Math.max(minFrame + 1, maxFrame)])
        .range([margin.left, width - margin.right]);

    const maximum = d3.max(
        series.flatMap(d => d.values),
        d => d.mean
    );

    const y = d3.scaleLinear()
        .domain([0, Math.max(1, maximum * 1.1)])
        .nice()
        .range([height - margin.bottom, margin.top]);

    // Horizontal grid lines

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(6)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat("")
        );

    // X axis

    svg.append("g")
        .attr("class", "axis")
        .attr("transform",
            `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));

    // Y axis

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(6));

    // X axis label

    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 10)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 12)
        .text("Frame");

    // Y axis label

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 12)
        .text("Mean step displacement (px)");

    // Line generator

    const lineGenerator = d3.line()
        .defined(d => Number.isFinite(d.mean))
        .x(d => x(d.frame))
        .y(d => y(d.mean));

    // Draw each cell line

    svg.selectAll(".movement-line")
        .data(series)
        .join("path")
        .attr("class", "movement-line")
        .attr("fill", "none")
        .attr("stroke", d => colors[d.cell_line])
        .attr("stroke-width", 1.8)
        .attr("stroke-linejoin", "round")
        .attr("d", d => lineGenerator(d.values));

    // Vertical hover indicator

    const hoverLine = svg.append("line")
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#cbd5e1")
        .attr("stroke-dasharray", "4 4")
        .style("visibility", "hidden");

    const hoverPoints = svg.append("g");

    // Interactive hover area

    svg.append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width - margin.left - margin.right)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "transparent")
        .style("cursor", "crosshair")

        .on("mousemove", function(event) {
            const [mouseX] = d3.pointer(event, svg.node());

            const frame = Math.max(
                minFrame,
                Math.min(maxFrame, Math.round(x.invert(mouseX)))
            );

            hoverLine
                .attr("x1", x(frame))
                .attr("x2", x(frame))
                .style("visibility", "visible");

            const currentValues = series.map(d => ({
                cell_line: d.cell_line,
                ...d.values[frame - minFrame]
            })).filter(d => Number.isFinite(d.mean));

            hoverPoints.selectAll("circle")
                .data(currentValues)
                .join("circle")
                .attr("cx", x(frame))
                .attr("cy", d => y(d.mean))
                .attr("r", 4)
                .attr("fill", d => colors[d.cell_line])
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1);

            let content = `<strong>Frame ${frame}</strong><br>`;

            currentValues.forEach(d => {
                content += `
                    <span style="color:${colors[d.cell_line]}">
                        ${d.cell_line}
                    </span>:
                    ${d.mean.toFixed(2)} px
                    (${d.fields} fields)<br>
                `;
            });

            if (currentValues.length === 0) {
                content += "No valid movement data";
            }

            tooltip
                .style("visibility", "visible")
                .style("left", `${event.pageX + 15}px`)
                .style("top", `${event.pageY + 15}px`)
                .html(content);
        })

        .on("mouseleave", function() {
            hoverLine.style("visibility", "hidden");
            hoverPoints.selectAll("circle").remove();
            tooltip.style("visibility", "hidden");
        });
}


// Track selection state

let selectedTrack = null;
let selectedTrackKeys = null;

// Return tracks matching the current filters

function getFilteredTracks() {
    return tracks.filter(d =>
        (selectedCellLine === "all" ||
            d.cell_line === selectedCellLine) &&
        (selectedField === "all" ||
            d.field_key === selectedField) &&
        Number.isFinite(d.mean_displacement) &&
        d.valid_steps > 0
    );
}

// Individual track scatterplot

function drawScatterChart() {

    const container = d3.select("#scatter-chart");

    container.selectAll("*").remove();
    container.style("flex-direction", "column");

    selectedTrack = null;
    selectedTrackKeys = null;

    d3.select("#track-details").html("");

    const data = getFilteredTracks();

    if (data.length === 0) {
        container.append("span")
            .attr("class", "placeholder")
            .text("No tracks available.");
        return;
    }

    const width = 1100;
    const height = 420;

    const margin = {
        top: 20,
        right: 30,
        bottom: 55,
        left: 70
    };

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("role", "group")
        .attr("aria-label", "Interactive cell track scatterplot");

    // Keep consistent scales across filters

    const x = d3.scaleLinear()
        .domain([0, d3.max(tracks, d => d.duration)])
        .nice()
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(tracks, d => d.mean_displacement)])
        .nice()
        .range([height - margin.bottom, margin.top]);

    // Horizontal grid lines

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(7)
                .tickSize(-(width - margin.left - margin.right))
                .tickFormat("")
        );

    // Vertical grid lines

    svg.append("g")
        .attr("class", "grid")
        .attr("transform",
            `translate(0,${height - margin.bottom})`)
        .call(
            d3.axisBottom(x)
                .ticks(10)
                .tickSize(-(height - margin.top - margin.bottom))
                .tickFormat("")
        );

    // X axis

    svg.append("g")
        .attr("class", "axis")
        .attr("transform",
            `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(10));

    // Y axis

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(7));

    // X axis label

    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 12)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 13)
        .text("Track duration (frames)");

    // Y axis label

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 13)
        .text("Mean step displacement (px)");

    // Draw individual tracks

    const points = svg.append("g")
        .selectAll("circle")
        .data(data, d => d.track_key)
        .join("circle")
        .attr("cx", d => x(d.duration))
        .attr("cy", d => y(d.mean_displacement))
        .attr("r", 3.5)
        .attr("fill", d => colors[d.cell_line])
        .attr("opacity", 0.45)
        .attr("pointer-events", "none");

    // Spatial index for efficient nearest-point lookup

    const pointIndex = d3.quadtree()
        .x(d => x(d.duration))
        .y(d => y(d.mean_displacement))
        .addAll(data);

    // Display selection status

    const status = container.append("div")
        .attr("class", "scatter-status")
        .text(`${data.length.toLocaleString()} tracks displayed`);

    // Highlight selected tracks

    function updatePointStyles() {
        points
            .attr("opacity", d => {
                if (selectedTrack?.track_key === d.track_key) {
                    return 1;
                }

                if (selectedTrackKeys === null) {
                    return 0.45;
                }

                return selectedTrackKeys.has(d.track_key)
                    ? 0.95 : 0.07;
            })
            .attr("r", d =>
                selectedTrack?.track_key === d.track_key
                    ? 6 : 3.5
            )
            .attr("stroke", d =>
                selectedTrack?.track_key === d.track_key
                    ? "#ffffff" : "none"
            )
            .attr("stroke-width", 2);
    }

    // Rectangular brush selection

    let brushing = false;

    const brush = d3.brush()
        .extent([
            [margin.left, margin.top],
            [width - margin.right, height - margin.bottom]
        ])

        .on("start", function() {
            brushing = true;
            tooltip.style("visibility", "hidden");
        })

        .on("brush end", function(event) {
            const selection = event.selection;

            if (selection) {
                const [[x0, y0], [x1, y1]] = selection;

                const matching = data.filter(d =>
                    x(d.duration) >= x0 &&
                    x(d.duration) <= x1 &&
                    y(d.mean_displacement) >= y0 &&
                    y(d.mean_displacement) <= y1
                );

                selectedTrackKeys = new Set(
                    matching.map(d => d.track_key)
                );

                status.text(
                    `${matching.length.toLocaleString()} of ` +
                    `${data.length.toLocaleString()} tracks selected`
                );
            } else {
                selectedTrackKeys = null;

                status.text(
                    `${data.length.toLocaleString()} tracks displayed`
                );
            }

            updatePointStyles();

            if (event.type === "end") {
                brushing = false;
                drawHistogram();
            }
        });

    const brushGroup = svg.append("g")
        .attr("class", "track-brush")
        .call(brush);

    brushGroup.select(".selection")
        .attr("fill", "#38bdf8")
        .attr("fill-opacity", 0.12)
        .attr("stroke", "#38bdf8")
        .attr("stroke-width", 1.5);

    // Hover indicator

    const hoverPoint = svg.append("circle")
        .attr("r", 6)
        .attr("fill", "none")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1.5)
        .attr("pointer-events", "none")
        .style("visibility", "hidden");

    // Hover over the nearest track

    svg.on("mousemove", function(event) {
        if (brushing) {
            hoverPoint.style("visibility", "hidden");
            return;
        }

        const [mx, my] = d3.pointer(event, svg.node());

        const nearest = pointIndex.find(mx, my, 12);

        if (!nearest) {
            tooltip.style("visibility", "hidden");
            hoverPoint.style("visibility", "hidden");
            return;
        }

        hoverPoint
            .attr("cx", x(nearest.duration))
            .attr("cy", y(nearest.mean_displacement))
            .style("visibility", "visible");

        tooltip
            .style("visibility", "visible")
            .style("left", `${event.pageX + 15}px`)
            .style("top", `${event.pageY + 15}px`)
            .html(`
                <strong style="color:${colors[nearest.cell_line]}">
                    ${nearest.cell_line}
                </strong><br>
                Field: ${nearest.field}<br>
                Track ID: ${nearest.track_id}<br>
                Start frame: ${nearest.start_frame}<br>
                End frame: ${nearest.end_frame}<br>
                Duration: ${nearest.duration} frames<br>
                Mean displacement:
                    ${nearest.mean_displacement.toFixed(2)} px<br>
                Divisions: ${nearest.divisions}<br>
                <em>Click to inspect track</em>
            `);
    });

    svg.on("mouseleave", function() {
        tooltip.style("visibility", "hidden");
        hoverPoint.style("visibility", "hidden");
    });

    // Select an individual track

    svg.on("click", function(event) {
        const [mx, my] = d3.pointer(event, svg.node());

        const nearest = pointIndex.find(mx, my, 12);

        if (!nearest) return;

        selectedTrack = nearest;

        updatePointStyles();
        showTrackDetails(nearest);
    });
}

// Display selected track information

function showTrackDetails(track) {
    d3.select("#track-details")
        .html(`
            <div class="track-info">
                <strong style="color:${colors[track.cell_line]}">
                    ${track.cell_line} — Track ${track.track_id}
                </strong>

                <div>Field: ${track.field}</div>
                <div>
                    Frames: ${track.start_frame}–${track.end_frame}
                </div>
                <div>Duration: ${track.duration} frames</div>
                <div>
                    Observations: ${track.observations}
                </div>
                <div>
                    Mean displacement:
                    ${track.mean_displacement.toFixed(2)} px
                </div>
                <div>Divisions: ${track.divisions}</div>
            </div>
        `);
    drawFieldExplorer(track);
}


// Movement distribution histogram

function drawHistogram() {
    const container = d3.select("#histogram-chart");

    container.selectAll("*").remove();
    container.style("flex-direction", "column");

    const allFilteredTracks = getFilteredTracks();

    const data = allFilteredTracks.filter(d =>
        selectedTrackKeys === null ||
        selectedTrackKeys.has(d.track_key)
    );

    if (allFilteredTracks.length === 0) {
        container.append("span")
            .attr("class", "placeholder")
            .text("No movement data available.");
        return;
    }

    const width = 640;
    const height = 320;

    const margin = {
        top: 25,
        right: 20,
        bottom: 50,
        left: 65
    };

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%")
        .attr("role", "img")
        .attr("aria-label", "Distribution of mean track displacement");

    // Keep displacement scale consistent across filters

    const x = d3.scaleLinear()
        .domain([
            0,
            d3.max(tracks, d => d.mean_displacement)
        ])
        .nice()
        .range([margin.left, width - margin.right]);

    // Create histogram bins

    const binGenerator = d3.bin()
        .value(d => d.mean_displacement)
        .domain(x.domain())
        .thresholds(x.ticks(25));

    const allBins = binGenerator(allFilteredTracks);
    const selectedBins = binGenerator(data);

    // Count tracks from each cell line in every bin

    const histogramData = selectedBins.map(bin => {
        const result = {
            x0: bin.x0,
            x1: bin.x1,
            total: bin.length
        };

        cellLines.forEach(line => {
            result[line] = bin.filter(
                d => d.cell_line === line
            ).length;
        });

        return result;
    });

    // Stack counts by cell line

    const stackedData = d3.stack()
        .keys(cellLines)(histogramData);

    const y = d3.scaleLinear()
        .domain([
            0,
            Math.max(1, d3.max(allBins, d => d.length))
        ])
        .nice()
        .range([height - margin.bottom, margin.top]);

    // Horizontal grid lines

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(6)
                .tickSize(
                    -(width - margin.left - margin.right)
                )
                .tickFormat("")
        );

    // X axis

    svg.append("g")
        .attr("class", "axis")
        .attr("transform",
            `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(8));

    // Y axis

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(y)
                .ticks(6)
                .tickFormat(d3.format("d"))
        );

    // X axis label

    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 10)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 12)
        .text("Mean step displacement (px)");

    // Y axis label

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", 12)
        .text("Number of tracks");

    // Show the original distribution behind a brush selection

    if (selectedTrackKeys !== null) {
        svg.append("g")
            .selectAll("rect")
            .data(allBins)
            .join("rect")
            .attr("x", d => x(d.x0) + 1)
            .attr("y", d => y(d.length))
            .attr("width", d =>
                Math.max(0, x(d.x1) - x(d.x0) - 2)
            )
            .attr("height", d => y(0) - y(d.length))
            .attr("fill", "#64748b")
            .attr("opacity", 0.25);
    }

    // Draw stacked histogram bars

    svg.append("g")
        .selectAll("g")
        .data(stackedData)
        .join("g")
        .attr("fill", d => colors[d.key])

        .selectAll("rect")
        .data(d => d)
        .join("rect")
        .attr("x", d => x(d.data.x0) + 1)
        .attr("y", d => y(d[1]))
        .attr("width", d =>
            Math.max(
                0,
                x(d.data.x1) - x(d.data.x0) - 2
            )
        )
        .attr("height", d => y(d[0]) - y(d[1]))
        .attr("opacity", 0.9);

    // Invisible hover regions for each histogram bin

    svg.append("g")
        .selectAll("rect")
        .data(histogramData)
        .join("rect")
        .attr("x", d => x(d.x0))
        .attr("y", margin.top)
        .attr("width", d => x(d.x1) - x(d.x0))
        .attr("height",
            height - margin.top - margin.bottom)
        .attr("fill", "transparent")
        .style("cursor", "crosshair")

        .on("mouseenter", function(event, d) {
            d3.select(this)
                .attr("fill", "#ffffff")
                .attr("fill-opacity", 0.06);

            let content = `
                <strong>
                    ${d.x0.toFixed(1)}–${d.x1.toFixed(1)} px
                </strong><br>
                Total tracks: ${d.total.toLocaleString()}<br>
            `;

            cellLines.forEach(line => {
                content += `
                    <span style="color:${colors[line]}">
                        ${line}
                    </span>:
                    ${d[line].toLocaleString()}<br>
                `;
            });

            tooltip
                .style("visibility", "visible")
                .html(content);
        })

        .on("mousemove", function(event) {
            tooltip
                .style("left", `${event.pageX + 15}px`)
                .style("top", `${event.pageY + 15}px`);
        })

        .on("mouseleave", function() {
            d3.select(this)
                .attr("fill", "transparent");

            tooltip.style("visibility", "hidden");
        });

    // Display histogram selection status

    const status = container.append("div")
        .attr("class", "histogram-status");

    if (selectedTrackKeys !== null) {
        status.text(
            `${data.length.toLocaleString()} of ` +
            `${allFilteredTracks.length.toLocaleString()} ` +
            `tracks selected`
        );

        container.append("div")
            .attr("class", "histogram-context")
            .text("Gray bars show the original distribution.");
    } else {
        status.text(
            `${data.length.toLocaleString()} tracks displayed`
        );
    }
}

// Refresh dashboard

function updateDashboard() {
    tooltip.style("visibility", "hidden");

    updateStatistics();
    drawBarChart();
    drawLineChart();
    drawScatterChart();
    drawHistogram();
    drawFieldExplorer();
}

// Cell line dropdown

d3.select("#cell-line").on("change", function() {
    selectedCellLine = this.value;
    selectedField = "all";

    updateFieldOptions();
    updateDashboard();
});

// Field dropdown

d3.select("#field").on("change", function() {
    selectedField = this.value;

    if (selectedField !== "all") {
        const field = fields.find(
            d => d.field_key === selectedField
        );

        if (field) {
            selectedCellLine = field.cell_line;

            d3.select("#cell-line")
                .property("value", selectedCellLine);
        }
    }

    updateFieldOptions();
    updateDashboard();
});

// Reset filters

d3.select("#reset-filters").on("click", function() {
    selectedCellLine = "all";
    selectedField = "all";

    d3.select("#cell-line")
        .property("value", "all");

    updateFieldOptions();
    updateDashboard();
});

// Initialize application

loadData();
