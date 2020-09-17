/* eslint-disable indent */
/**
 * Copyright 2020 Paul Reed & Bart Butenaers
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
 
 // See here for Javascript examples and explanation: https://plotly.com/javascript/plotlyjs-function-reference/

module.exports = function(RED) {
    const path   = require('path');
    const fs     = require('fs');
    const jsdom  = require('jsdom');
    const vm     = require('vm');
    
    const PLOTLY_ARRAY_PREFIX  = "#@array_name@#";
    const PLOTLY_BOOLEAN_TRUE  = "#@boolean_true@#";
    const PLOTLY_BOOLEAN_FALSE = "#@boolean_false@#";
    
    // -------------------------------------------------------------------------------------------------
    // Determining the path to the files in the dependent plotly.js-dist-min module once.
    // See https://discourse.nodered.org/t/use-files-from-dependent-npm-module/17978/5?u=bartbutenaers
    // -------------------------------------------------------------------------------------------------
    var plotlyJsPath = require.resolve("plotly.js-dist-min");
    // To debug the Plotly itself, it might be handy to see the full source code instead of the minified version.
    // 1. Do an 'npm install plotly.js-dist'
    // 2. Put the above require statement in comment
    // 3. Add the require statement below
    //var plotlyJsPath = require.resolve("plotly.js-dist");

    if (!fs.existsSync(plotlyJsPath)) {
        console.log("Javascript file " + plotlyJsPath + " does not exist");
        plotlyJsPath = null;
    }
    
    // Load Plotly on the NodeJs server in a Plotly context (which is a NodeJs VM)
    function createServerDom(divId) {
        var plotlyServerDom;
        
        try {
            // We need Plotly to run on the server side (NodeJs), however Plotly only runs in a browser.
            // However on their wiki page it is explained how to work around this:
            // See https://github.com/jsdom/jsdom/wiki/Don%27t-stuff-jsdom-globals-onto-the-Node-global
            // So we need to run the Plotly code in the JsDom context, in order to keep the NodeJs globals
            // See example on https://gist.github.com/etpinard/58a9e054b9ca7c0ca4c39976fc8bbf8a
            
            plotlyServerDom = new jsdom.JSDOM('<!DOCTYPE html><body><div id="' + divId + '"></div></body>', { runScripts: 'dangerously'});
         
            // Mock a few things that JSDOM doesn't support out-of-the-box
            plotlyServerDom.window.HTMLCanvasElement.prototype.getContext = function() { return null; };
            plotlyServerDom.window.URL.createObjectURL = function() { return null; };

            var plotlyJsSource = fs.readFileSync(plotlyJsPath, 'utf-8');
            plotlyServerDom.window.eval(plotlyJsSource);
            
            // See https://github.com/plotly/plotly.js/issues/5151
            plotlyServerDom.window.process = {versions: 1};
        }
        catch(e) {
            plotlyServerDom = null;
            node.error("Cannot setup the Plotly context: " + e);
        }
        
        return plotlyServerDom;
    }

    // Create a global server dom, to be used in the http admin endpoint below.
    // Indeed that endpoint will be called for undeployed Plotly nodes, i.e. which are not know on the server side yet.
    // So we cannot use the node.plotlyServerDom in that endpoint.
    // Since there is no node id, we will use - the randomly chosen - name "global" ...
    globalPlotlyServerDom = createServerDom("global");
    
    function LZ(n){
        if(n <= 9) {
            return "0" + n;
        }
        return n;
    }
    
    // Fill a specified object with the specified properties, which can be nested properties with '.' notations
    function fillObjectWithProperties(obj, properties) {
        for (var i = 0; i < properties.length; i++) {
            var property = properties[i];
            var pointer = obj;
            
            var propertyNames = property.name.split(".");
            
            for (var j = 0; j < propertyNames.length-1; j++) {
                var propertyName = propertyNames[j];
                if (!(propertyName in pointer)) {
                    pointer[propertyName] = {};
                }
                pointer = pointer[propertyName];
            }
            pointer[propertyNames[propertyNames.length-1]] = property.value;
        }
    }
    
    // Create a Plotly config based on the config (screen) from this node
    function createPlotlyConfig(config) {
        var plotlyConfig = {};
        plotlyConfig.layout = {};
        plotlyConfig.traces = [];
        plotlyConfig.configuration = {};
        
        // Copy the non-plotly related information (which we need on the frontend side), from the node config to the plotly config
        plotlyConfig.id = config.id;
        plotlyConfig.sharedState = config.sharedState;
        
        fillObjectWithProperties(plotlyConfig.layout, config.layoutProperties || []);
                
        // Some property values need post-processing.  The client-side will wrap the property values with "#@...@#", so the 
        // server-side will know which kind of post-processing is required.
        
        // Boolean values will be send as strings by the client-side, so convert those to real booleans.
        Object.keys(plotlyConfig.layout).forEach(function(key,index) {
            var layoutPropertyValue = plotlyConfig.layout[key];
            
            if (layoutPropertyValue === PLOTLY_BOOLEAN_TRUE) {
                plotlyConfig.layout[key] = true;
            }
            else if (layoutPropertyValue === PLOTLY_BOOLEAN_FALSE) {
                plotlyConfig.layout[key] = false;
            }
        });
        
        // Make sure there is an initial x-axis timestamp, otherwise the first datapoint reverts to 1970
        var now = new Date();
        var timestamp = now.getFullYear() + "-" + LZ(now.getMonth() + 1) + "-" + LZ(now.getDate()) + " " + LZ(now.getHours()) + ":" + LZ(now.getMinutes()) + ":" + LZ(now.getSeconds());
                         
        // Convert the trace config to a Plotly format.  Example result:
        //    {
        //       name: 'my_trace',
        //       type: 'bar',
        //       marker: {
        //          color: '#8080ff',
        //          opacity: 0.7,
        //          line:   {
        //          color: '#0033cc',
        //          width: 1.5
        //       }
        //    }  
        config.traces.forEach(function(traceConfig) {
            // Initalize the x-axis with a timestamp, otherwise the first datapoint will be 1970!!
            var trace = {};
            
            trace.name = traceConfig.name;
            trace.type = traceConfig.type;
            trace.x = [timestamp];
            trace.y = [0];
            
            // The properties referring to an array, should have the array content as value (instead of the array name)
            for(var i = 0; i < traceConfig.properties.length; i++) {
                var traceProperty = traceConfig.properties[i];
                 
                if (typeof traceProperty.value === 'string') {
                    // Boolean values will be send as strings by the client-side, so convert those to real booleans.
                    if (traceProperty.value === PLOTLY_BOOLEAN_TRUE) {
                        traceProperty.value = true;
                    }
                    else if (traceProperty.value === PLOTLY_BOOLEAN_FALSE) {
                        traceProperty.value = false;
                    }
                    // The properties that contain array names, can be recognized by the PLOTLY_ARRAY_PREFIX in their value
                    else if(traceProperty.value.startsWith(PLOTLY_ARRAY_PREFIX)) {
                        var arrayName = traceProperty.value.replace(PLOTLY_ARRAY_PREFIX, "");
                        var arrayContent = [];
                        
                        for(var j = 0; j < config.arrays.length; j++) {
                            var array = config.arrays[j];
                            
                            // The specified array name has been found
                            if (array.name === arrayName) {
                                // Get all the values from the array
                                for(var k = 0; k < array.items.length; k++) {
                                    arrayContent.push(array.items[k].value);
                                }
                            }
                        }
                        
                        if (!arrayContent) {
                            console.log("Could not find an array with name " + arrayName);
                        }
                        else {
                            // Replace the array name by the array content
                            traceProperty.value = arrayContent;
                        }
                    }
                }
            }
            
            fillObjectWithProperties(trace, traceConfig.properties);
            
            plotlyConfig.traces.push(trace);
        });
        
        plotlyConfig.configuration.displayModeBar = false;
        
        return plotlyConfig;
    }
    
    function HTML(plotlyConfig) {       
        // The configuration is a Javascript object, which needs to be converted to a JSON string
        var configAsJson = JSON.stringify(plotlyConfig);

        var html = String.raw`
        <div id='plotlychart_` + plotlyConfig.id + `' ng-init='init(` + configAsJson + `)'>
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
    
    function hasDataCorrectType(dataValue, expectedDataType) {
        switch(expectedDataType) {
            case "-":
                // Should we check whether one of the below types is passed ???????????????
                break;
            case "linear":
            case "log":
                if(isNaN(dataValue)) {
                    return "number";
                }
                break;
            case "date":
                if (!/^[0-9]{1,4}-[0-9]{1,2}-[0-9]{1,2} [0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}/.test(dataValue)) {
                    return "timestamp with format 'YYYY-MM-DD HH:mm:ss'";
                }
                break;
            case "category":
            case "multicategory": // Moet multicategory een array van strings zijn ??????????
                if (typeof dataValue !== "string" || dataValue.trim() === "") { // Moeten dit strings zijn ????????????????
                    return "string";
                }
                break;	    
        }
        
        return null;
    }

    var ui = undefined;

    // =======================================================================
    // The node ...
    // =======================================================================
    function PlotlyChart(config) {
        try {
            var node = this;
            
            node.getSharedState = function() {
                var sharedState = [];
                
                // Get the 'data' attribute of the Plotly chart in the server-side Jsdom tree
                var graphData = node.plotlyServerDom.window.document.getElementById(divId).data;
                            
                // Only keep (for every trace in the graphData) the x and y variables, which are arrays of values
                for (var j = 0; j < graphData.length; j++) {
                    sharedState.push({
                        x: graphData[j].x,
                        y: graphData[j].y
                    });
                }
                
                return sharedState;
            }
            
            if(ui === undefined) {
                ui = RED.require("node-red-dashboard")(RED);
            }
            RED.nodes.createNode(this, config);             
            
            if (checkConfig(node, config)) {
                var plotlyConfig = createPlotlyConfig(config);

                var divId = "plotlychart_" + plotlyConfig.id;
                node.plotlyServerDom = createServerDom(divId);
                
                // Create a Plotly server-side chart, if shared state is required
                if (config.sharedState) {
                    node.plotlyServerDom.window.Plotly.react(divId, plotlyConfig.traces, plotlyConfig.layout, plotlyConfig.configuration);
                }
                
                if (node.plotlyServerDom.window) {
                    // Let Plotly validate the config
                    var jsonResult = node.plotlyServerDom.window.Plotly.validate(plotlyConfig.traces, plotlyConfig.layout);
                    
                    if (jsonResult) {
                        // TODO show which error(s)  ???
                        node.error("Invalid config!");
                    }
                }
                else {
                    node.error("Cannot validate the node config, since Plotly hasn't been loaded!");
                }
                
                var html = HTML(plotlyConfig);
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
                        // ******************************************************************************************
                        // Server side validation of input messages.
                        // ******************************************************************************************
                        
                        if (config.validateInputMsg) {
                            var newMsg = {};
                            
                            if (!node.plotlyServerDom.window) {
                                node.error("Cannot validate the msg, since Plotly hasn't been loaded!");
                                newMsg.invalid_message = true;
                                return { msg: newMsg };
                            }

                            // Would like to ignore invalid input messages, but that seems not to possible in UI nodes:
                            // See https://discourse.nodered.org/t/custom-ui-node-not-visible-in-dashboard-sidebar/9666
                            // We will workaround it by sending a "newMsg.invalid_message = true" to the dashboard.

                            try {
                                // Get the input from the specified message field, and store it in a fixed 'input' field.
                                newMsg.input = RED.util.getMessageProperty(msg, config.inputField);
                            } 
                            catch(err) {
                                node.error("Error getting msg." + config.inputField + " : " + err.message);
                                newMsg.invalid_message = true;
                                return { msg: newMsg };
                            }
                            
                            if (!newMsg.input) {
                                node.error(config.inputField + " is not available in the message");
                                newMsg.invalid_message = true;
                                return { msg: newMsg };
                            }

                            if (typeof newMsg.input !== 'object') {
                                node.error(config.inputField + " should be a Javascript object");
                                newMsg.invalid_message = true;
                                return { msg: newMsg };
                            }

                            if (!newMsg.input.data && !newMsg.input.layout) {
                                node.error("The input msg should contain " + config.inputField + ".data or " + config.inputField + "layout");
                                newMsg.invalid_message = true;
                                return { msg: newMsg };
                            }

                            if (newMsg.input.layout) {
                                // TODO validate based on the plotly schema
                                
                            }

                            if (newMsg.input.data) {
                                if (typeof newMsg.input.data !== 'object') {
                                    node.error(config.inputField + ".data should be a Javascript object");
                                    newMsg.invalid_message = true;
                                    return { msg: newMsg };
                                }

                                if (!newMsg.input.data.y) {
                                    node.error(config.inputField + ".y is not available in the message");
                                    newMsg.invalid_message = true;
                                    return { msg: newMsg };
                                }
                                
                                if (!Array.isArray(newMsg.input.data.y)) {
                                    node.error(config.inputField + ".data.y should be a an array");
                                    newMsg.invalid_message = true;
                                    return { msg: newMsg };
                                }

                                var tracesCount = plotlyConfig.traces.length;
                                
                                if (newMsg.input.data.y.length != tracesCount) {
                                    node.error(config.inputField + ".data.y should contain " + tracesCount + " values (one for every trace)");
                                    newMsg.invalid_message = true;
                                    return { msg: newMsg };
                                }
                                
                                var yAxisType = (plotlyConfig.layout.yaxis || {}).type || "-"; // Default "-"
                                
                                for (var i = 0; i < newMsg.input.data.y.length; i++) {
                                    var wrongType = hasDataCorrectType(newMsg.input.data.y[i], yAxisType);
                                    
                                    if (wrongType) {
                                        node.error(config.inputField + ".data.y[" + i + "] should be type " + wrongType);
                                        newMsg.invalid_message = true;
                                        return { msg: newMsg };
                                    }
                                }
                                
                                // Missing x values?
                                if (!newMsg.input.data.x) {
                                    if (plotlyConfig.layout.xaxis.type === "date") {
                                        // Create a timestamp for NOW in the x-axis format ('YYYY-MM-DD HH:mm:ss')
                                        var now = new Date();
                                        var timestamp = now.getFullYear() + "-" + LZ(now.getMonth() + 1) + "-" + LZ(now.getDate()) + " " + LZ(now.getHours()) + ":" + LZ(now.getMinutes()) + ":" + LZ(now.getSeconds());

                                        // Create an array, with one x value (i.e. timestamp) for every y value
                                        newMsg.input.data.x = [];
                                        for (var i = 0; i < newMsg.input.data.y.length; ++i) {
                                            newMsg.input.data.x.push(timestamp);
                                        }
                                    }
                                    else {
                                        node.error(config.inputField + ".x is not available in the message");
                                        newMsg.invalid_message = true;
                                        return { msg: newMsg };
                                    }
                                }
                                
                                var xAxisType = (plotlyConfig.layout.xaxis || {}).type || "-"; // Default "-"
                                
                                for (var i = 0; i < newMsg.input.data.x.length; i++) {
                                    var wrongType = hasDataCorrectType(newMsg.input.data.x[i], xAxisType);
                                    
                                    if (wrongType) {
                                        node.error(config.inputField + ".data.x[" + i + "] should be type " + wrongType);
                                        newMsg.invalid_message = true;
                                        return { msg: newMsg };
                                    }
                                }
                            }

                            // At this point we have done all our basic validations, and tried to trigger user-friendly error messages.
                            // Now let Plotly validate the input data
                            /*var jsonResult = node.plotlyServerDom.window.Plotly.validate(newMsg.input);

                            if (jsonResult) {
                                // TODO show which error(s)  ???
                                node.error("The input is not valid: " + jsonResult);
                                newMsg.invalid_message = true;
                                return { msg: newMsg };
                            }*/
                        }
                            
                        // Since the input message needs to contain one value for each trace, pass all trace indexes to Plotly
                        newMsg.input.arg = [];
                        for (var i = 0; i < config.traces.length; ++i) {
                            newMsg.input.arg.push(i);
                        }
                        
                        // Convert the arrays to an arrays of arrays (as Plotly expects that kind of input)
                        newMsg.input.data.x = (newMsg.input.data.x).map(i => [i]);
                        newMsg.input.data.y = (newMsg.input.data.y).map(i => [i]);
                        
                        // Update the server-side traces with new data, if shared state is requested
                        if (config.sharedState) {
                            node.plotlyServerDom.window.Plotly.extendTraces(divId, {x: newMsg.input.data.x, y: newMsg.input.data.y}, newMsg.input.arg, 20); // 20 = traceIndices (number of points in chart, needs to be an option in node config)
                            
                            // Send an output message containing the (updated) shared state
                            node.send({ payload: node.getSharedState() });
                        }
                        
                        // Seem that all the specified msg fields are available, so send a message to the client (containing msg.input).
                        // This way the message has been flattened, so the client doesn't need to access the nested msg properties.
                        // See https://discourse.nodered.org/t/red-in-ui-nodes/29824/2
                        return { msg: newMsg };
                    },
                    beforeSend: function (msg, orig) {
                        if (orig) {
                            return orig.msg;
                        }
                    },
                    initController: function($scope, events) {
                        $scope.flag = true;   // not sure if this is needed?

                        $scope.init = function (config) {
                            $scope.config = config;
                            $scope.divId = "plotlychart_" + config.id;

                            // Load the Plotly library in the HEAD of the page, not locally in the html!
                            // See https://stackoverflow.com/questions/45868530/why-am-i-getting-an-uncaught-referenceerror-plotly-is-not-defined
                            // We will need to load the library SYNCHRONOUS, while that is normally not considered good practice!  
                            // Reason is that - after a page refresh - the last received input message will be replayed (by the client-side), and 
                            // and then code inside the msg watch would give an error "Plotly is not defined"...
                            var xhrObject = new XMLHttpRequest();
                            // open and send a synchronous request
                            xhrObject.open('GET', "ui_plotly_chart/dashboard/" + config.id + "/plotly.js", false);
                            xhrObject.send('');
                            // add the returned content to a newly created script tag
                            var se = document.createElement('script');
                            se.type = "text/javascript";
                            se.text = xhrObject.responseText;
                            document.getElementsByTagName('head')[0].appendChild(se);
                            
                            if (config.sharedState) {
                                // When shared state is enable, load the data points synchronous from the server (jsDom) and add them to the client-side Plotly chart
                                var sharedState = $.ajax({
                                                        type: "GET",
                                                        dataType: "json",
                                                        url: "ui_plotly_chart/dashboard/" + config.id + "/shared_state",
                                                        async: false
                                                    }).responseText;
                                                    
                                // Convert the returned json string to a Javascript object
                                sharedState = JSON.parse(sharedState);
                                                    
                                for (var i = 0; i < config.traces.length; ++i) {
                                    config.traces[i].x = sharedState[i].x;
                                    config.traces[i].y = sharedState[i].y;
                                }
                            }
                            
                            // Let Plotly setup the layout and traces.
                            // After that our DIV element will be contain a 'data' attribute (called 'gd.data'), containing our configuration.
                            Plotly.react($scope.divId, $scope.config.traces, $scope.config.layout, $scope.config.configuration);
                        };

                        $scope.$watch('msg', function(msg) {
                            // Ignore undefined msg
                            if (!msg) { 
                                return; 
                            }
                            
                            // Ignore messages which have been flagged invalid (by our server side validations).
                            if (msg.invalid_message) {
                                return;
                            }
                            
                            //prevent client side replays from showing the menu when switching dashboard tabs
                            if(msg._ui_cm_already_seen){
                                console.log("ui_context_menu: msg already seen - exiting!")
                                return;
                            }
                            msg._ui_cm_already_seen = true;

                            // Update the client-side traces with new data
                            Plotly.extendTraces($scope.divId, {x: msg.input.data.x, y: msg.input.data.y}, msg.input.arg, 20); // 20 = traceIndices (number of points in chart, needs to be an option in node config)
                            
                            // 'chart_format' includes chart title, background & plot colour.
                            // 'trace_format' includes trace colour, markers, trace 'shape' (linear, spline, etc).
                            //let chart_format = msg.payload.chart_format || null;
                            //let trace_format = msg.payload.trace_format || null;

                            // Update both traces & chart formats
                            // TODO Plotly.update($scope.divId, trace_format, chart_format, arg);
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
    uiPath = '/' + uiPath + '/ui_plotly_chart/dashboard/:node_id/:resource';

    // Replace a sequence of multiple slashes (e.g. // or ///) by a single one
    uiPath = uiPath.replace(/\/+/g, '/');
	
    // Make the minified Plotly.js library available (to the DASHBOARD).
    RED.httpNode.get(uiPath, function(req, res) {
        switch(req.params.resource) { 
            case "plotly.js":
                if (plotlyJsPath) {
                    res.sendFile(plotlyJsPath);
                }
                else {
                    res.status(404).json('Undefined Plotly path');
                }
                break;
            case "shared_state":
                var node = RED.nodes.getNode(req.params.node_id);
                
                if (node) {
                    res.status(200).json(node.getSharedState());
                }
                else {
                    res.status(404).json('Cannot find node with id = ' + req.params.node_id);
                }
                break;
            default:
                res.status(404).json('Unknown plotly resource');
        }
    });
    
    // Make all dynamic content available for autocomplete (to the FLOW EDITOR).
    RED.httpAdmin.put('/ui_plotly_chart/flow/:resource', function(req, res) {
        var jsonResult;
        
        switch(req.params.resource) {     
            case "json_schema":
                if (globalPlotlyServerDom.window) {
                    // Generate the plotly json schema for the flow editor.
                    // See https://github.com/plotly/plotly.js/issues/5087
                    jsonResult = globalPlotlyServerDom.window.Plotly.PlotSchema.get();
                }
                else {
                    console.log("Cannot generate json schema, since Plotly hasn't been loaded!");
                }
                break;
            case "convert_to_plotly_format":
                // Convert the node config to a Plotly config
                jsonResult = createPlotlyConfig(req.body.node_config);
                break;
            case "validate_config":
                if (globalPlotlyServerDom.window) {
                    
                    globalPlotlyServerDom.window.layout
                    // Convert the node config to a Plotly config
                    var plotlyConfig = createPlotlyConfig(req.body.node_config);
                    
                    // Let Plotly validate the configuration
                    jsonResult = globalPlotlyServerDom.window.Plotly.validate(plotlyConfig.traces, plotlyConfig.layout);
                    
                    // Plotly returns undefined when there are no validation issues.
                    // Set it to an empty issue array, to avoid that below a status 404 would be returned.
                    if (!jsonResult) {
                        jsonResult = [];
                    }
                }
                else {
                    console.log("Cannot generate json schema, since Plotly hasn't been loaded!");
                }
                break;
            default:
                console.log("Unknown plotly dynamic resource '" + req.params.resource + "'");
        }
        
        if (jsonResult) {
            // Send the json result to the client
            res.status(200).json(jsonResult);
        }
        else {
            res.status(404).json('Unknown plotly resource');
        }
    });
}
