# node-red-contrib-ui-plotly
A node-RED contrib node to deliver Plotly charts

### DO NOT USE! - work in progress!!


## TODO's
- [ ] Support build-in colorscales https://plotly.com/python/builtin-colorscales/ & https://plotly.com/javascript/colorscales/
- [ ] What to do with the `any` data type?  No response yet on my [question](https://community.plotly.com/t/visualising-a-property-with-data-type-any/44343).
- [ ] Add validation of arrays (based on the array type)
   Should there be an option in trace config to add a trace to either the x or y axis (there would only be 1 x-axis)
- [ ] Fix header lines on the editableLists: they need to be properly aligned with the columns below, even when the config screen is resized. See this [discussion](https://discourse.nodered.org/t/alignment-of-headers-in-editablelist/32071)
- [ ] Make sure the editableLists always expand to the full available area's.  See updateEditorHeight(node,node.editor)
- [ ] Which step size do we need to specify on input of type "number" and "angle"?
- [ ] Add the ability to generate an output message containing the graph as image.  For SVG see [here](https://gist.github.com/etpinard/58a9e054b9ca7c0ca4c39976fc8bbf8a)
- [ ] When generating the input for Plotly (on the server-side), the names of the arrays should be replaced by the content of the arrays  --> not sure how to find the link between both ...
- [ ] The `marker.symbol` property has a dropdown with both numeric and string values, since plotly offers two ways to enter symbols (e.g. "0" = "circle").  Not sure how to get rid of the numbers, because other `values` lists in the scheme.json file don't use both numbers and strings ...
- [ ] What to do with _deprecated properties in the json scheme?  Suppose somebody has used property `A.B.C.D` which in a new version becomes `A.B.C._deprecated.D` then he will get an error (red border) because property `A.B.C.D` doesn't exist anymore. But there will be no link to the new `A.B.C._deprecated.D`. Would have been better if they had added a property `deprecated:true` to the existing property...
behind the scenes...
- [ ] Show an "Index" column in the editableList on the "Traces" tabsheet.
- [ ] Make the layout / traces adjustable via input messages & add validation
- [ ] Follow up of the [issue](https://discourse.nodered.org/t/confusion-about-object-prototype/32605) for Plotly.js, where we ask them whether the isPlainObject could be fixed.  If it ever could become fixed, we have to remove the `createObject` ànd `createArray` from our code.
