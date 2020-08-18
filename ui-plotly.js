/* eslint-disable indent */
/**
 * Copyright 2020 Paul Reed
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    const path = require('path');
    const fs   = require('fs');
    
    // -------------------------------------------------------------------------------------------------
    // Determining the path to the files in the dependent plotly.js module once.
    // See https://discourse.nodered.org/t/use-files-from-dependent-npm-module/17978/5?u=bartbutenaers
    // -------------------------------------------------------------------------------------------------
    var plotlyJsPath = require.resolve("plotly.js-dist-min");

    if (!fs.existsSync(plotlyJsPath)) {
        console.log("Javascript file " + plotlyJsPath + " does not exist");
        plotlyJsPath = null;
    }
    
    function HTML(config) {
        // The configuration is a Javascript object, which needs to be converted to a JSON string
        var configAsJson = JSON.stringify(config);

        var html = String.raw`
        <div id='plotlychart_` + config.id + `' ng-init='init(` + configAsJson + `)'>
        `;
        return html;
    }

    function checkConfig(node, conf) {
        if (!conf || !conf.hasOwnProperty("group")) {
            node.error(RED._("ui_plotly.error.no-group"));
            return false;
        }
        return true;
    }

    var ui = undefined;

    function PlotlyChart(config) {
        try {
            var node = this;
            if(ui === undefined) {
                ui = RED.require("node-red-dashboard")(RED);
            }

            RED.nodes.createNode(this, config);
            if (checkConfig(node, config)) {

		var ui = RED.require('node-red-dashboard')(RED);
		var sizes = ui.getSizes();
                var html = HTML(config);
                var done = ui.addWidget({
                    node: node,
                    order: config.order,
                    group: config.group,
                    width: config.width,
                    height: config.height,
                    format: html,
                    templateScope: "local",
                    emitOnlyNewValues: false,
                    forwardInputMessages: false,
                    storeFrontEndInputAsState: false,
                    convertBack: function (value) {
                        return value;
                    },
                    beforeEmit: function(msg, value) {
                        return { msg: msg };
                    },
                    beforeSend: function (msg, orig) {
                        if (orig) {
                            return orig.msg;
                        }
                    },
                    initController: function($scope, events) {
                        function LZ(n){
                            if(n <= 9) {
                                return "0" + n;
                            }
                            return n;
                        }

                        $scope.flag = true;   // not sure if this is needed?

                        $scope.init = function (config) {
                            $scope.config = config;
                            $scope.divId = "plotlychart_" + config.id;

                            // Make sure there is an initial x-axis timestamp, otherwise the first datapoint reverts to 1970
                            var now = new Date();
                            var timestamp = now.getFullYear() + "-" + LZ(now.getMonth() + 1) + "-" + LZ(now.getDate()) + " " + LZ(now.getHours()) + ":" + LZ(now.getMinutes()) + ":" + LZ(now.getSeconds());
                            
                            $scope.traces = [];
                            
                            // Convert the traces to a Plotly format.  Suppose the config.traces contains items like this:
                            // config.traces = [{
                            //      type: "zzz",
                            //      name: "xxx",
                            //      marker_color: ""
                            // }]
                            // Then the $scope.traces object will look like this:
                            // $scope.traces = [{
                            //      type: "zzz",
                            //      name: "xxx",
                            //      marker: {
                            //           color: "xxx"
                            //      }
                            // }]
                            // Which means that the underscores will result in nested properties ...
		           
			    // Get size, padding, etc of widgets & group, so chart plot fits group
 				var plot_padding = 2;
				var plot_size_x  = (((config.width*sizes.sx)+((config.width -1)*sizes.cx))-(sizes.gx + (plot_padding*2)));
 				var plot_size_y  = (((config.height*sizes.sy)+((config.height -1)*sizes.cy))-(sizes.gy + (plot_padding*2)));
 
                            for(var m = 0; m < config.traces.length; m++) {
                                var configTrace = config.traces[m];
                                var keys = Object.keys(configTrace);
                                
                                // Initalize the trace with a timestamp, otherwise the first datapoint will be 1970!!
                                var nodeTrace = {
                                    x: [timestamp],
                                    y: [0]
                                }

                                for (var j = 0; j < keys.length; j++) {
                                    var key = keys[j];
                                    var obj = nodeTrace;
                                    
                                    var propertyNames = key.split("_"); 
                                    for (var k = 0; k < propertyNames.length-1; k++) {
                                        var propertyName = propertyNames[k];
                                        if (!(propertyName in obj)) {
                                            obj[propertyName] = {};
                                        }
                                        obj = obj[propertyName];
                                    }
                                    obj[propertyNames[propertyNames.length-1]] = configTrace[key];
                                }
                                
                                $scope.traces.push(nodeTrace);
                            }
                            
                            // Convert the graph configuration to a Plotly format
                            // TODO what with yAxisType?  In paul his example there was also not that one ...
                            $scope.chart = {
                                    title: config.chartTitle,
                                    "xaxis": {
                                        "title": config.xAxisTitle,
                                        "type": config.xAxisType,
                                    },
                                    "yaxis": {
                                        "title": config.yAxisTitle
                                    },
                                    titlefont: {
                                        size: 22,
                                        },
                                    autosize: false,
				    width: plot_size_x,
				    height: plot_size_y,
				     margin: {
   					l: 60,
					r: 50,
					b: 60,
					t: 50,
					pad: plot_padding
					},
                            }
                            
                            $scope.configuration = {
                                displayModeBar: false
                            }

                            // Load the Plotly library in the head of the page, not locally in the html!
                            // See https://stackoverflow.com/questions/45868530/why-am-i-getting-an-uncaught-referenceerror-plotly-is-not-defined
                            var script = document.createElement('script');
                            script.type = 'text/javascript';
                            script.src = 'ui_plotly_chart/plotly.js';
                            script.async = false; 
                            
                            // Make sure to wait until the script is loaded, otherwise the error "Plotly is not defined" will occur
                            script.addEventListener('load', () => {
                                // Create a trace template in the node config
                                Plotly.react($scope.divId, $scope.traces, $scope.chart, $scope.configuration);
                            })

                            document.getElementsByTagName('head')[0].appendChild(script);
                        };

                        $scope.$watch('msg', function(msg) {
                            if (!msg) { return; } // Ignore undefined msg

                            var y = msg.payload.data;
                            
                            // Convert the array to an array of arrays (as Plotly expects that kind of input)
                            y = (y).map(i => [i]);
                            
                            // var x = msg.time;

                            // Create a timestamp suitable for the chart x-axis, which means format 'YYYY-MM-DD HH:mm:ss'
                            var now = new Date();
                            var timestamp = now.getFullYear() + "-" + LZ(now.getMonth() + 1) + "-" + LZ(now.getDate()) + " " + LZ(now.getHours()) + ":" + LZ(now.getMinutes()) + ":" + LZ(now.getSeconds());
                            // end of Create timestamp ////////////////////////////////////////////     

                            // 'chart_format' includes chart title, background & plot colour.
                            // 'trace_format' includes trace colour, markers, trace 'shape' (linear, spline, etc).
                            let chart_format = msg.payload.chart_format || null;
                            let trace_format = msg.payload.trace_format || null;

                            // Provide corresponding timestamps (xVal) for each y trace
                            // Identify trace indexes (arg) for updating by extendTraces
                            let xVal = [],arg = [];
                            var count = 0;
                            for (var i = 0; i < y.length; ++i) {
                                    arg.push(count);
                                    xVal.push([timestamp])
                                    count++;
                            }

                            // Update traces with new data
                            Plotly.extendTraces($scope.divId, {x: xVal,y: y}, arg, 20); // 20 = traceIndices (number of points in chart, needs to be an option in node config)

                            // Update both traces & chart formats
                            Plotly.update($scope.divId, trace_format, chart_format, arg);
                        });
                    }
                });
            }
        }
        catch (e) {
            console.warn(e);
        }

        node.on("close", function() {
            if (done) {
                done();
            }
        });
    }

    RED.nodes.registerType("ui_plotly-chart", PlotlyChart);

    // By default the UI path in the settings.js file will be in comment:
    //     //ui: { path: "ui" },
    // But as soon as the user has specified a custom UI path there, we will need to use that path:
    //     ui: { path: "mypath" },
    var uiPath = ((RED.settings.ui || {}).path) || 'ui';
	
    // Create the complete server-side path
    uiPath = '/' + uiPath + '/ui_plotly_chart/plotly.js';

    // Replace a sequence of multiple slashes (e.g. // or ///) by a single one
    uiPath = uiPath.replace(/\/+/g, '/');
	
    // Make the Plotly.js library available (to the DASHBOARD).
    RED.httpNode.get(uiPath, function(req, res){
        if (plotlyJsPath) {
            res.sendFile(plotlyJsPath);
        }
        else {
            res.status(404).json('Undefined Plotly path');
        }
    });
}
