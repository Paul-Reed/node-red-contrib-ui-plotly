# node-red-contrib-ui-plotly
A node-RED contrib node to deliver Plotly charts

### DO NOT USE! - work in progress!!


## TODO's
- [ ] Support build-in colorscales https://plotly.com/python/builtin-colorscales/ & https://plotly.com/javascript/colorscales/
- [X] Create endpoint to allow a "Validate" button in the config screen.  Question: is valdidation of layout possible in flow editor, or do we need to do it in the dashboard (because the valdate method both needs data and layout ...)??
- [X] Button to show the generated json in a popup???
- [ ] Pass the selected array to Plotly
- [ ] What to do with the `any` data type?  No response yet on my [question](https://community.plotly.com/t/visualising-a-property-with-data-type-any/44343).
- [ ] Add validation of arrays (based on the array type)
- [ ] Solve error *"Indices must be valid indices for gd.data"*
- [ ] Determine how  to pick which array (in the input message) contains the data for the x-axis. --> typedinput 'msg' or 'fixed' on the first tabsheet??
- [ ] Currently, the assumption is that the x-axis is a timestamp, auto generated by the node, but it will not always be the case, and we may need to be able to select the x-axis from the incoming data arrays, such as;
   ```
   {
	   "month":["January","February","March"],
	   "rainfall":["4.6","4.9","9.3"],
	   "sunshine":["6.7","7.8","10"]
   }
   ```
   And have a further option to tell plotly how to format the x-axis timestamps - tickformat
   ```
   {
	   "date":["2020-07-24 16:49:29","2020-07-24 16:59:29","2020-07-24 17:09:29"],
	   "rainfall":["4.6","4.9","9.3"],
	   "sunshine":["6.7","7.8","10"]
   }
   ```
   Should there be an option in trace config to add a trace to either the x or y axis (there would only be 1 x-axis)
- [ ] Fix header lines on the editableLists: they need to be properly aligned with the columns below, even when the config screen is resized. See this [discussion](https://discourse.nodered.org/t/alignment-of-headers-in-editablelist/32071)
- [ ] Make sure the editableLists always expand to the full available area's.  See updateEditorHeight(node,node.editor)
- [X] What to do with the yAxisType?  --> Solved since the first tabsheet contains now an editableList
- [X] Disable "properties" tabsheet, when no traces are availalbe
- [X] Disable "items" tabsheet, when no arrays are availalbe
- [ ] Which step size do we need to specify on input of type "number" and "angle"?
- [X] When a tabsheet opens, set the focus on a field.
- [X] Convert the first tabsheet "Graph" to an editableList.
- [X] When one of the validation fails, the node should get a red triangle in the flow editor.
- [X] Try to run Plotly via JSdom on the server side and execute validations there.
- [ ] Add the ability to generate an output message containing the image as image.  For SVG see [here](https://gist.github.com/etpinard/58a9e054b9ca7c0ca4c39976fc8bbf8a)
- [X] Rename the first tabsheet to "Layout" (and also all related variables in the code)
- [ ] When generating the input for Plotly (on the server-side), the names of the arrays should be replaced by the content of the arrays  --> not sure how to find the link between both ...
- [ ] The `marker.symbol` property has a dropdown with both numeric and string values, since plotly offers two ways to enter symbols (e.g. "0" = "circle").  Not sure how to get rid of the numbers, because other `values` lists in the scheme.json file don't use both numbers and strings ...
- [ ] What to do with _deprecated properties in the json scheme?  Suppose somebody has used property `A.B.C.D` which in a new version becomes `A.B.C._deprecated.D` then he will get an error (red border) because property `A.B.C.D` doesn't exist anymore. But there will be no link to the new `A.B.C._deprecated.D`. Would have been better if they had added a property `deprecated:true` to the existing property...
