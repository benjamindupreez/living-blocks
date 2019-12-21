let scores = [];
let topLeft;
let topRight;

let squarePinned = false;
let pinnedSquare = null;

let onMobile = window.innerWidth <= 768;

d3.json("combined_scores.json").then((data) => {

	// hide loading spinner
	d3.select("#spinner").attr("class", "hidden");

	scores = data.scores;

	let settingsOpen = true;
	d3.select("#toggle-sidebar-button").on("click", closeSettings);

	function openSettings() {
		settingsOpen = !settingsOpen;
		d3.select("#toggle-sidebar-button-icon").attr("class", "fa fa-arrow-circle-up fa-2x");
		d3.select("#input-container").style("display", "block");
		d3.select("#toggle-sidebar-button").on("click", closeSettings);
	}

	function closeSettings() {
		settingsOpen = !settingsOpen;
		d3.select("#toggle-sidebar-button-icon").attr("class", "fa fa-arrow-circle-down fa-2x");
		d3.select("#input-container").style("display", "none");
		d3.select("#toggle-sidebar-button").on("click", openSettings);
	}

	function resize() {

		let width = window.innerWidth;
  		if(width > 768) {
  			onMobile = false;

  			// esure that the settings menu will show if resized past the threshold
  			if(!settingsOpen) {
  				openSettings();
  			}
  		} else {
  			onMobile = true;
  		}

	}
	window.onresize = resize;

	// INITIALIZE THE MAP
	let map = L.map('main').setView([33.7537, -84.39], 13);
	map.doubleClickZoom.disable();

	L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}{r}.png', {
		attribution: '<a href="https://wikimediafoundation.org/wiki/Maps_Terms_of_Use">Wikimedia</a>',
		minZoom: 11,
		maxZoom: 19
	}).addTo(map);

	// Add a svg canvas to the overlay panel of the map and save a reference to it
	let svg = d3.select(map.getPanes().overlayPane).append("svg");
	let g = svg.append("g").attr("class", "leaflet-zoom-hide");

	// Custom weights
	let crimeSlider = 50;
	let restaurantsSlider = 50;
	let parkSlider = 50;
	let busSlider = 50;
	let subwaySlider = 50;

	// Attach change listeners to sliders to update weights
	d3.select("#crimeSlider").on("input", function() {
		crimeSlider = parseInt(d3.select(this).property('value'));
		drawHeatmap();
	});
	d3.select("#restaurantsSlider").on("input", function() {
		restaurantsSlider = parseInt(d3.select(this).property('value'));
		drawHeatmap();
	});
	d3.select("#parkSlider").on("input", function() {
		parkSlider = parseInt(d3.select(this).property('value'));
		drawHeatmap();
	});
	d3.select("#busSlider").on("input", function() {
		busSlider = parseInt(d3.select(this).property('value'));
		drawHeatmap();
	});
	d3.select("#subwaySlider").on("input", function() {
		subwaySlider = parseInt(d3.select(this).property('value'));
		drawHeatmap();
	});

	d3.select("#similarity-check").on("change", function() {

			// if the user enables similarity checking and a square has been pinned, draw its similarity lines now
			if(d3.select(this).property("checked") === true) {
				if(squarePinned == true && d3.select("#similarity-check").property("checked") == true) {
					let nearestNeighbours = kNearestNeighbours(pinnedSquare, 3);
					drawConnectingLines(pinnedSquare, nearestNeighbours);
				}
			} else {
				removeConnectingLines();
			}

	});

	// redraw the heatmap when the zoom changes
	map.on('zoomend', () => {
		drawHeatmap();

		// if a square is pinned and similar lines should be shown redraw the connecting lines to handle zoom change
		if(squarePinned == true && d3.select("#similarity-check").property("checked") == true) {
			let nearestNeighbours = kNearestNeighbours(pinnedSquare, 3);
			drawConnectingLines(pinnedSquare, nearestNeighbours);
		}
	});

	map.on('zoomstart', () => {

		// remove all artifacts of previously highlighted or pinned squares
		squarePinned = false;
		removeConnectingLines();
		g.selectAll("rect").attr("stroke-width", "0");
		tooltip.hide();

	});

	map.on('dragstart', () => {
		tooltip.hide();
	});

	// tooltip
	let tooltip = d3.tip()
	  .attr('class', 'd3-tip')
	  .attr('class', 'tooltip')
	svg.call(tooltip);

	// set canvas boundaries
	canvasBottomRight = projectPoint(-70,20);
	canvasTopLeft = projectPoint(-90,40);

	// invert crime scores to become a bad thing
	scores.map((d) => {
		d["crime_score"] = 100 - d["crime_score"];
		return d;
	});

	// Define color scale
	let quantizeColorScale = d3.scaleQuantize().domain([0, 100]).range(['#d73027','#fc8d59','#fee08b','#d9ef8b','#91cf60','#1a9850']);

	// Draw heatmap
	drawHeatmap();

	function drawHeatmap() {

		let colorScale = d3.scaleSequential(d3.interpolateGreens).domain([0, 1]);
		//  d3.scaleDiverging(d3.interpolateRdYlGn);

		// resize svg to fit all items
		//let topLeft = projectPoint(scores[0].long[1], scores[0].lat[1]);
		//let bottomRight = projectPoint(scores[scores.length-1].long[3], scores[scores.length-1].lat[3]);
		svg.attr("width", canvasBottomRight.x - canvasTopLeft.x)
	    .attr("height", canvasBottomRight.y - canvasTopLeft.y)
	    .style("left", canvasTopLeft.x + "px")
	    .style("top", canvasTopLeft.y + "px");

		g.attr("transform", "translate(" + -canvasTopLeft.x + "," + -canvasTopLeft.y + ")");
		
		// join
		let squares = g.selectAll("rect").attr("class", "squares").data(scores);

		// update
		squares.attr("fill", (d) => {

							let weightedScore = (crimeSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["crime_score"] 
											+ (restaurantsSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["restaurant_score"]
											+ (busSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["bus_score"]
											+ (parkSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["park_score"]
											+ (subwaySlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["subway_score"];

							return quantizeColorScale(weightedScore);

						}).attr("width", (d) => {

					      	let topLeft = projectPoint(d.long[1], d.lat[1]);
					      	let topRight = projectPoint(d.long[2], d.lat[2]);

					      	return topRight.x - topLeft.x;
				      })	
				      .attr("height", (d) => {

					      	let topLeft = projectPoint(d.long[1], d.lat[1]);
		      				let bottomLeft = projectPoint(d.long[0], d.lat[0]);

					      	return bottomLeft.y - topLeft.y;
				      })
				        .attr("x", (d) => projectPoint(d.long[1], d.lat[1]).x)
		      			.attr("y", (d) => projectPoint(d.long[1], d.lat[1]).y);

		// enter
		let squaresEnter = squares.enter().append("rect")
		      .attr("fill", (d) => {

					let weightedScore = (crimeSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["crime_score"] 
											+ (restaurantsSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["restaurant_score"]
											+ (busSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["bus_score"]
											+ (parkSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["park_score"]
											+ (subwaySlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["subway_score"];

					return quantizeColorScale(weightedScore);

				})
		      .attr("fill-opacity", 0.4)
		      .attr("width", (d) => {

		      	let topLeft = projectPoint(d.long[1], d.lat[1]);
		      	let topRight = projectPoint(d.long[2], d.lat[2]);

		      	return topRight.x - topLeft.x;
		      })
		      .attr("height", (d) => {

		      	let topLeft = projectPoint(d.long[1], d.lat[1]);
		      	let bottomLeft = projectPoint(d.long[0], d.lat[0]);

		      	return bottomLeft.y - topLeft.y;
		      })
		      .attr("x", (d) => projectPoint(d.long[1], d.lat[1]).x)
		      			.attr("y", (d) => projectPoint(d.long[1], d.lat[1]).y)
		      			.attr('pointer-events', 'all')
		      .on("mouseover", function(d) {

		      		// on mobile -> override the default behavior
		      		if(onMobile) {
		      			return;
		      		}

		      		// if another square isn't pinned already, update hover effects
		      		if(squarePinned === false) {

			      		if(d3.select("#similarity-check").property("checked") == true){
				      		// add similarity lines
				      		let nearestNeighbours = kNearestNeighbours(d, 3);

				      		// connect this square to similar ones
				      		drawConnectingLines(d, nearestNeighbours);
			      		}

						// on mouseover highlight border
						d3.select(this).attr("stroke", "#444444").attr("stroke-width", "2");

						let weightedScore = (crimeSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["crime_score"] 
											+ (restaurantsSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["restaurant_score"]
											+ (busSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["bus_score"]
											+ (parkSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["park_score"]
											+ (subwaySlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["subway_score"];


						d3.select("#area-text-1").text("Low Crime").style("background-color", quantizeColorScale(d["crime_score"]));
						d3.select("#area-text-2").text("Restaurants").style("background-color", quantizeColorScale(d["restaurant_score"]));
						d3.select("#area-text-3").text("Parks").style("background-color", quantizeColorScale(d["park_score"]));
						d3.select("#area-text-4").text("Bus Access").style("background-color", quantizeColorScale(d["bus_score"]));
						d3.select("#area-text-5").text("Subway Access").style("background-color", quantizeColorScale(d["subway_score"]));
						d3.select("#area-text-6").html("<strong>Recommended For You: " + parseInt(weightedScore) + "%</strong>");

						// show tooltip
						tooltip.html("<div class='percentage-tooltip-text'>" + parseInt(weightedScore) + "%</div>Click to Pin").show(this);

						// set tooltip text color
						d3.select(".percentage-tooltip-text").style("color", quantizeColorScale(parseInt(weightedScore)));

						// update the link of the "Open in Zillow Button"
						d3.select("#open-in-zillow-button").attr("href", "https://www.zillow.com/homes/for_sale/?currentLocationSearch=true&searchQueryState={%22pagination%22:{},%22mapBounds%22:{" 
							+ "%22west%22:" + d.long[0]
							+",%22east%22:" + d.long[1]
							+",%22south%22:" + d.lat[0]
							+ ",%22north%22:" + d.lat[1]
							+ "},%22mapZoom%22:18,%22isMapVisible%22:true,%22filterState%22:{%22isAllHomes%22:{%22value%22:true},%22isForRent%22:{%22value%22:true}},%22isListVisible%22:true}");

		      		}

				})
				.on("mouseout", function(d) {

					// on mobile -> override the default behavior
		      		if(onMobile) {
		      			return;
		      		}

					// if another square isn't pinned already, update hover effects
		      		if(squarePinned === false) {

		      			// remove old connection lines
		      			removeConnectingLines();

						// on mouseover highlight border
						d3.select(this).attr("stroke-width", "0");

						// hide tooltip
						tooltip.hide();

					}

				}).on("click", function(d) {

					// on mobile -> override the default behavior to show tooltip
		      		if(onMobile) {

		      			// clear the borders of all previously selected rectangles
		      			g.selectAll("rect").attr("stroke-width", "0");

		      			// on mouseover highlight border
						d3.select(this).attr("stroke", "#444444").attr("stroke-width", "2");

						let weightedScore = (crimeSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["crime_score"] 
											+ (restaurantsSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["restaurant_score"]
											+ (busSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["bus_score"]
											+ (parkSlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["park_score"]
											+ (subwaySlider / (crimeSlider + restaurantsSlider + busSlider + parkSlider + subwaySlider)) * d["subway_score"];

						// show tooltip
						tooltip.html("<div class='percentage-tooltip-text-mobile'>" + parseInt(weightedScore) + "%</div><a class='btn btn-secondary btn-sm active' role='button' aria-pressed='true' target='_blank' href=https://www.zillow.com/homes/for_sale/?currentLocationSearch=true&searchQueryState={%22pagination%22:{},%22mapBounds%22:{" 
							+ "%22west%22:" + d.long[0]
							+",%22east%22:" + d.long[1]
							+",%22south%22:" + d.lat[0]
							+ ",%22north%22:" + d.lat[1]
							+ "},%22mapZoom%22:18,%22isMapVisible%22:true,%22filterState%22:{%22isAllHomes%22:{%22value%22:true},%22isForRent%22:{%22value%22:true}},%22isListVisible%22:true}>Listings</a>").show(this);

						// set tooltip text color
						d3.select(".percentage-tooltip-text-mobile").style("color", quantizeColorScale(parseInt(weightedScore)));

		      			return;
		      		}

		      		// default non-mobile behavior starts here

					if(squarePinned === true) {
						g.selectAll("rect").attr("stroke-width", "0");
						removeConnectingLines();
					} else {
						pinnedSquare = d;
					}

					// toggle pinned flag
					squarePinned = !squarePinned;
				});

		squares.merge(squaresEnter);

	}

	// this function maps input lat, long data to pixels on the screen
	function projectPoint(x, y) {
		let point = map.latLngToLayerPoint(new L.LatLng(y, x));
		return point;
	}

	// gets the k nearest neighbours of a square
	function kNearestNeighbours(square, k) {

		// sort all squares by their similarity to the given square and return the top k most similar ones
		let nearest = scores.concat().sort((a, b) => {
			
			// calculates d's distance from the given square
			function distance(d) {
				return Math.sqrt(Math.pow(d.crime_score - square.crime_score, 2) 
					+ Math.pow(d.restaurant_score - square.restaurant_score, 2)
					+ Math.pow(d.park_score - square.park_score, 2)
					+ Math.pow(d.bus_score - square.bus_score, 2)
					+ Math.pow(d.subway_score - square.subway_score, 2));
			}

			return distance(a) - distance(b);
		});

		return nearest.slice(1, k+1);
	}

	// this function draws connection lines between one source square and several target squares
	function drawConnectingLines(source, targets) {

		let sourcePixels = projectPoint(source.long[0], source.lat[0]);
	 
		let lineGenerator = d3.line().curve(d3.curveCardinal);

		g.selectAll("path").data(targets).enter().append("path").attr("d", (d) => {

				// top left corner positions of our source and target
		    	let targetPixels = projectPoint(d.long[0], d.lat[0]);
		    	let sourcePixels = projectPoint(source.long[0], source.lat[0]);

		    	// change corners if necessary depending on their orientation towrds each other
		    	if(targetPixels.x > sourcePixels.x) {
		    		sourcePixels.x = projectPoint(source.long[1], source.lat[0]).x;
		    	} else {
		    		targetPixels.x = projectPoint(d.long[1], d.lat[0]).x;
		    	}

		    	if(targetPixels.y > sourcePixels.y) {
		    		yDiffSign = 1;
		    		sourcePixels.y = projectPoint(source.long[0], source.lat[2]).y;
		    	} else {
		    		yDiffSign = -1;
		    		targetPixels.y = projectPoint(d.long[0], d.lat[2]).y;
		    	}

		    	let points = [[sourcePixels.x, sourcePixels.y], 
		    	[8 + sourcePixels.x + (targetPixels.x - sourcePixels.x)/2, 8 *  yDiffSign + sourcePixels.y + (targetPixels.y - sourcePixels.y)/2], 
		    	[targetPixels.x, targetPixels.y]];

		    	return lineGenerator(points);

		    });
	}

	function removeConnectingLines() {
		d3.selectAll("path").remove();
	}
});