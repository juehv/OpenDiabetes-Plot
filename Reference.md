# Reference

## DataManager

As we need to display big datasets, performance is an important issue.
Filtering these datasets often takes to long to display them efficiently.
Therefore, the DataManager implements the following features to use the data efficiently:
- crossfilter is used to store and filter the data
- data is also clustered depending on the time range to conquer overplotting

### readData(data)
Reads the diabetes data from "data" into the crossfilter object.

### getRenderData(domain)
Returns clustered and aggregated data depending on domain.
The input domain is a list of two date objects representing the domain which needs to be displayed.
DataManager updates the internal crossfilter filter to match the current domain.
The output is an object of the following form:
```
output = {
   glucose: glucoseData,
   basal: basalData,
   carbs: carbsData,
   glucoseDisplay: 'displayType'
   basalDisplay:   'displayType'
   percentileDay: statistical representation of glucose data over one day
}
```
The data is already clustered and aggregated.
carbs and basal are always returned as an absolute value, therefore the display type does not change.
Glucose and basal, however, adapt their display type according to the time range.

Glucose data can be displayed either as 'point', meaning that each item in the glucose dataset is a single point, or 'percentile' meaning that the data is aggregated and the display should represent a box plot.
Each item in the display form 'percentile' has the following attributes:

```
timeStart: first point in the clustered data
time: average time value where item should be displayed on x-axis
timeEnd: end point in the clustered data
percentile: array of size 5 containing the 10th, 25th, 50th, 75th and 90th percentile.
```

## Chart
The chart is a wrapper object that includes the DataManager and decides which display componenent should be rendered.
It also implements responsive and interactive features to the `<svg>` element.
Zooming in on the `<svg>` element causes the time range to be changed and the DataManager to update and display the new data.

## PointGlucose
Component that creates the glucose points


## BarGlucose
Component that creates the glucose bar elements

## LineBasal
Creates the line basal component

## BarBasal
Creates the bar basal component

## BarBolusCarbs
Creates the bar component for bolus and carbs

## Statistics
Component for time in range statistics

## PercentileDay
Component for intraday statistics

## TimeAxis
Creates time axis and background
Automatically adapts display to time range and screen width
