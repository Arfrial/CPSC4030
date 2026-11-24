
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
        console.error("Error loading dataset:", error);

        d3.select("#bar-chart")
            .text("Unable to load dataset. Check the console.");
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

// Refresh dashboard

function updateDashboard() {
    updateStatistics();
    drawBarChart();

    // Additional charts will be added here.
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
