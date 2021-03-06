import * as d3 from 'd3';
import crossfilter from 'crossfilter2';

class DataManager {
	constructor() {
		this.domain = [new Date(0), new Date(0)];
		this.buffer = [new Date(0), new Date(0)];
		this.dataDomain = [];
		this.display = 'yearly'
		this.glucoseLevels = {
			hypo: 60,
			low: 80,
			high: 150,
			hyper: 250
		}
		this.types = {
			basal_profile: 'BASAL_PROFILE',
			basal_temp: 'BASAL_TEMP',
			glucose: 'GLUCOSE_CGM',
			bolus: 'BOLUS_NORMAL',
			carbs: 'MEAL_MANUAL',
			refined: 'REFINED_VAULT_ENTRY',
			predictions: 'CGM_PREDICTION'
		}
	}
	readData(data) {
		//TODO Annahme Daten sind nach Datum sortiert
		//More efficient algo
		console.log(data.filter(d => d.type == 'BOLUS_NORMAL'));
		const hours = 60000 * 60;
		const minute = 60000;
		const underLimit = 40;
		const upperLimit = 400;
		const basalTimeLimit = 0;
		let last_basal_profile = undefined;
		let last_basal_temp = undefined;
		let item = undefined;
		let items = [];
		let lastPredication = undefined;
		let maxDomain = [Infinity, 0];
		//Iterate data
		for (let i = 0; i < data.length; i++) {
			//Throw away data which cannot be parsed
			if (!data[i] || !data[i].epoch || !data[i].value || !data[i].type) continue;
			//Calculate maxDomain
			if (data[i].epoch < maxDomain[0]) maxDomain[0] = data[i].epoch;
			if (data[i].epoch > maxDomain[1]) maxDomain[1] = data[i].epoch;
			let value;
			let lastValue;
			switch (data[i].type) {
				case (this.types.glucose):
					value = parseInt(data[i].value);
					if (value < underLimit) value = underLimit;
					if (value > upperLimit) value = upperLimit;
					item = {
						time: new Date(data[i].epoch),
						value: value,
						type: this.types.glucose,
						origin: data[i].origin,
						source: data[i].source
					}
					items.push(item);
					break;
				case (this.types.basal_profile):
					lastValue = 0.00;
					value = parseFloat(data[i].value);
					if (last_basal_profile && data[i].epoch - last_basal_profile.timeEnd.getTime() <= basalTimeLimit) {
						lastValue = last_basal_profile.value;
					}
					item = {
						time: new Date(data[i].epoch),
						value: value,
						type: this.types.basal_profile,
						lastValue: lastValue,
						timeEnd: new Date(data[i].epoch + (1) * hours)
					}

					//Check temp insulin
					if (!last_basal_temp || last_basal_temp.timeEnd.getTime() <= item.time.getTime()) {
						if (last_basal_temp) {
							let newTempPrev = {
								time: last_basal_temp.timeEnd,
								value: item.lastValue,
								type: this.types.basal_temp,
								lastValue: last_basal_temp.value,
								timeEnd: item.time
							}
							items.push(newTempPrev);

						}
						let newTemp = {
							time: item.time,
							value: item.value,
							type: this.types.basal_temp,
							lastValue: last_basal_temp && last_basal_temp.timeEnd.getTime() == item.time.getTime() ? last_basal_temp.value : item.lastValue,
							timeEnd: item.timeEnd
						}
						last_basal_temp = newTemp;
						items.push(newTemp);
					}

					last_basal_profile = item;
					items.push(item);
					break;

				case (this.types.basal_temp):
					//Check for reset (valueExtension == 0)
					if (data[i].valueExtension == 0) {
						last_basal_temp.timeEnd = new Date(data[i].epoch);
						break;
					}
					item = {
						time: new Date(data[i].epoch),
						value: parseFloat(data[i].value),
						valueExtension: data[i].valueExtension,
						type: this.types.basal_temp,
						lastValue: 0.00,
						timeEnd: new Date(data[i].epoch + (data[i].valueExtension * minute))
					}
					if (last_basal_temp) {
						if (last_basal_temp.timeEnd.getTime() >= item.time.getTime()) {
							last_basal_temp.timeEnd = new Date(item.time.getTime());
							item.lastValue = last_basal_temp.value;

						} else {
							let newBasal = {
								time: new Date(last_basal_temp.timeEnd.getTime()),
								value: last_basal_profile && last_basal_profile.timeEnd.getTime() > item.time.getTime() ? last_basal_profile.value : 0.00,
								type: this.types.basal_temp,
								lastValue: last_basal_temp.value,
								timeEnd: new Date(item.time.getTime())
							}
							items.push(newBasal);
							item.lastValue = newBasal.value;
						}

					}
					last_basal_temp = item;
					items.push(item);
					break;
				case (this.types.bolus):
					item = {
						time: new Date(data[i].epoch),
						value: parseFloat(data[i].value),
						type: this.types.bolus,
						origin: data[i].origin,
						source: data[i].source
					}
					items.push(item);
					break;
				case (this.types.carbs):
					item = {
						time: new Date(data[i].epoch),
						value: parseFloat(data[i].value),
						type: this.types.carbs,
						origin: data[i].origin,
						source: data[i].source
					}
					items.push(item);
					break;
				case (this.types.refined):
					if (this.types.predictions == data[i].refinedType) {
						let predictItem = {
							value: parseFloat(data[i].value),
							valueExtension: data[i].valueExtension,
							origin: data[i].origin,
							source: data[i].source,
							typeLabel: data[i].typeLabel
						}
						if (lastPredication && lastPredication.time.getTime() == data[i].epoch) {
							lastPredication.value.push(predictItem);
						} else {
							let newPrediction = {
								time: new Date(data[i].epoch),
								value: [],
								type: this.types.predictions,
							}
							newPrediction.value.push(predictItem);
							lastPredication = newPrediction;
							items.push(newPrediction)
						}
					}
					break;
				default:
					break;
			}

		}

		this.maxDomain = [new Date(maxDomain[0]), new Date(maxDomain[1])];

		let types = this.types;
		let data_crossfilter = crossfilter(items);
		//Create filter dimension
		let filter_dim = data_crossfilter.dimension(d => d.time);
		let group_dim = data_crossfilter.dimension(d => d.time);
		let groupThreeHour = group_dim.group(d => d3.timeMinute.every(10).floor(d)).reduce(
			function reduceAdd(p, v) {
				if (v.type == types.glucose) {
					p.glucose.sum += parseInt(v.value);
					p.glucose.count++;
					p.glucose.avg = p.glucose.sum / p.glucose.count;
					return p;
				}
				else if (v.type == types.basal_profile || v.type == types.basal_temp) {
					let weight = (v.timeEnd - v.time) / (60000 * 60.0);
					p.basal.sum += (weight * v.value);
					return p;
				} else if (v.type == types.bolus) {
					p.bolus.sum += v.value;
					return p;
				} else if (v.type == types.carbs) {
					p.carbs.sum += v.value;
					return p;
				}
				else {
					return p;
				}
			},
			function reduceRemove(p, v) {
				if (v.type == types.glucose) {
					p.glucose.sum -= parseInt(v.value);
					p.glucose.count--;
					p.glucose.avg = p.glucose.sum / p.glucose.count;
					return p;
				}
				else if (v.type == types.basal_profile || v.type == types.basal_temp) {
					let weight = (v.timeEnd - v.time) / (60000 * 60);
					p.basal.sum -= (weight * v.value);
					return p;

				} else if (v.type == types.bolus) {
					p.bolus.sum -= v.value;
					return p;
				} else if (v.type == types.carbs) {
					p.carbs.sum -= v.value;
					return p;
				}
				else {
					return p;
				}
			},
			function reduceInitial() {
				return {
					glucose: {
						sum: 0,
						count: 0,
						avg: 0,
					},
					basal: {
						sum: 0,
					},
					bolus: {
						sum: 0,
					},
					carbs: {
						sum: 0,
					}
				}
			}
		);


		let groupSixHour = group_dim.group(d => d3.timeMinute.every(20).floor(d)).reduce(
			function reduceAdd(p, v) {
				if (v.type == types.glucose) {
					p.glucose.sum += parseInt(v.value);
					p.glucose.count++;
					p.glucose.avg = p.glucose.sum / p.glucose.count;
					return p;
				}
				else if (v.type == types.basal_profile || v.type == types.basal_temp) {
					let weight = (v.timeEnd - v.time) / (60000 * 60.0);
					p.basal.sum += (weight * v.value);
					return p;
				} else if (v.type == types.bolus) {
					p.bolus.sum += v.value;
					return p;
				} else if (v.type == types.carbs) {
					p.carbs.sum += v.value;
					return p;
				}
				else {
					return p;
				}
			},
			function reduceRemove(p, v) {
				if (v.type == types.glucose) {
					p.glucose.sum -= parseInt(v.value);
					p.glucose.count--;
					p.glucose.avg = p.glucose.sum / p.glucose.count;
					return p;
				}
				else if (v.type == types.basal_profile || v.type == types.basal_temp) {
					let weight = (v.timeEnd - v.time) / (60000 * 60);
					p.basal.sum -= (weight * v.value);
					return p;

				} else if (v.type == types.bolus) {
					p.bolus.sum -= v.value;
					return p;
				} else if (v.type == types.carbs) {
					p.carbs.sum -= v.value;
					return p;
				}
				else {
					return p;
				}
			},
			function reduceInitial() {
				return {
					glucose: {
						sum: 0,
						count: 0,
						avg: 0,
					},
					basal: {
						sum: 0,
					},
					bolus: {
						sum: 0,
					},
					carbs: {
						sum: 0,
					}
				}
			}
		);
		let limit = 400;
		//Reduce function for percentile
		function reduceAddPercentile(p, v) {
			if (v.type == types.glucose) {
				let value = v.value;
				if (value > limit) {
					value = limit;
				}
				p.glucose.median_arr[value] ? p.glucose.median_arr[value]++ : p.glucose.median_arr[value] = 1; 
				p.glucose.sum += v.value;
				p.glucose.count++;
				p.glucose.avg = p.glucose.sum / p.glucose.count;
				return p;
			}
			else if (v.type == types.basal_profile || v.type == types.basal_temp) {
				let weight = (v.timeEnd - v.time) / (60000 * 60.0);
				p.basal.sum += (weight * v.value);
				return p;
			} else if (v.type == types.bolus) {
				p.bolus.sum += v.value;
				return p;
			} else if (v.type == types.carbs) {
				p.carbs.sum += v.value;
				return p;
			}
			else {

				return p;
			}
		}
		function reduceRemovePercentile(p, v) {
			if (v.type == types.glucose) {
				let value = v.value;
				if (value > limit) {
					value = limit;
				}
				p.glucose.median_arr[value]--;
				p.glucose.sum -= v.value;
				p.glucose.count--;
				p.glucose.avg = p.glucose.sum / p.glucose.count;
				return p;
			}
			else if (v.type == types.basal_profile || v.type == types.basal_temp) {
				let weight = (v.timeEnd - v.time) / (60000 * 60);
				p.basal.sum -= (weight * v.value);
				return p;

			} else if (v.type == types.bolus) {
				p.bolus.sum -= v.value;
				return p;
			} else if (v.type == types.carbs) {
				p.carbs.sum -= v.value;
				return p;
			}
			else {
				return p;
			}
		}
		function reduceInitialPercentile() {
			return {
				glucose: {
					sum: 0,
					count: 0,
					avg: 0,
					median_arr: new Array(limit + 1),
				},
				basal: {
					sum: 0,
				},
				bolus: {
					sum: 0,
				},
				carbs: {
					sum: 0,
				}
			}
		}
		let groupDaily = group_dim.group(d => d3.timeDay.floor(d)).reduce(
			reduceAddPercentile,
			reduceRemovePercentile,
			reduceInitialPercentile
		);

		//let week = 60000 * 60 * 24 * 7;
		let groupWeekly = group_dim.group(d => d3.timeWeek.floor(d)).reduce(
			reduceAddPercentile,
			reduceRemovePercentile,
			reduceInitialPercentile
		);

		let groupMonthly = group_dim.group(d => d3.timeMonth.floor(d)).reduce(
			reduceAddPercentile,
			reduceRemovePercentile,
			reduceInitialPercentile
		);

		//Statistical groups

		let glucoseLevels = this.glucoseLevels;
		let group_stats_range = group_dim.groupAll().reduce(
			function reduceAdd(p, v) {
				if (v.type == types.glucose) {
					//Compute hour
					let hour = v.time.getHours();
					let minute = Math.floor(v.time.getMinutes() / 10);
					let value = parseInt(v.value);
					p.stats[hour * 6 + minute][value] ? p.stats[hour * 6 + minute][value]++ : p.stats[hour * 6 + minute][value] = 1;
					p.count++;
					p.sum += value;
					if (value < glucoseLevels.hypo) {
						p.hypo++;
					} else if (value < glucoseLevels.low) {
						p.low++;
					} else if (value > glucoseLevels.hyper) {
						p.hyper++;
					} else if (value > glucoseLevels.high) {
						p.high++;
					} else {
						p.normal++;
					}
				}
				return p;
			},
			function reduceRemove(p, v) {
				if (v.type == types.glucose) {
					//Compute hour
					let hour = v.time.getHours();
					let minute = Math.floor(v.time.getMinutes() / 10);
					let value = parseInt(v.value);
					p.stats[hour * 6 + minute][value]--;
					p.count--;
					p.sum -= value;
					if (value < glucoseLevels.hypo) {
						p.hypo--;
					} else if (value < glucoseLevels.low) {
						p.low--;
					} else if (value > glucoseLevels.hyper) {
						p.hyper--;
					} else if (value > glucoseLevels.high) {
						p.high--;
					} else {
						p.normal--;
					}
				}
				return p;
			},
			function reduceInitial() {
				//Init array for minutes
				let size = 24 * 6;
				let time = new Array(size);
				let i;
				for (i = 0; i < time.length; i++) {
					time[i] = new Array(limit + 1);
				}
				return {
					count: 0,
					sum: 0,
					hypo: 0,
					low: 0,
					normal: 0,
					high: 0,
					hyper: 0,
					stats: time,
				}
			}
		);

		//Group access
		this.data = {
			raw: data_crossfilter,
			three: groupThreeHour,
			six: groupSixHour,
			daily: groupDaily,
			weekly: groupWeekly,
			monthly: groupMonthly,
			stats_range: group_stats_range,
		}
		this.filter = filter_dim;

	}
	getDomain() {
		return this.domain;
	}
	getMaxDomain() {
		return this.maxDomain;
	}
	getMaxZoom() {
		//Max Zoom -> 1 hour
		let hour = 60 * 60000;
		let domain_delta = this.maxDomain[1] - this.maxDomain[0];
		let zoom = domain_delta / hour;
		return zoom;

	}
	getRenderData(domain) {
		//Filter Domain -> later


		//const week = 60000 * 60 * 24 * 7;
		const hours = Math.floor((domain[1] - domain[0]) / (60000 * 60));
		let display = 0;
		if (hours > 24 * 30 * 12) {
			display = 5;
		}
		else if (hours > 24 * 7 * 4 * 3) {
			display = 4;
		}
		else if (hours > 24 * 7 * 3) {
			display = 3;
		}
		else if (hours > 24 * 7) {
			display = 2;
		}
		else if (hours > 24 * 3) {
			display = 1;
		}

		//Load Data
		let data = undefined;
		let timeOffset = undefined;
		switch (display) {
			case (0):
				this.filter.filterRange(domain);
				data = this.data.raw.allFiltered();
				break;
			case (1):
				domain = domain.map(d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), (d.getMinutes() - d.getMinutes() % 10)));
				this.filter.filterRange(domain);
				data = this.data.three.all();
				timeOffset = d3.timeMinute.every(10);
				break;
			case (2):
				domain = domain.map(d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), (d.getMinutes() - d.getMinutes() % 20)));
				this.filter.filterRange(domain);
				data = this.data.six.all();
				timeOffset = d3.timeMinute.every(20);
				break;
			case (3):
				domain = domain.map(d => d3.timeDay.ceil(d));
				this.filter.filterRange(domain);
				data = this.data.daily.all();
				timeOffset = d3.timeDay;
				break;
			case (4):
				domain = domain.map(d => d3.timeWeek.ceil(d));
				this.filter.filterRange(domain);
				data = this.data.weekly.all();
				timeOffset = d3.timeWeek;
				break;
			case (5):
				domain = domain.map(d => d3.timeMonth.ceil(d));
				this.filter.filterRange(domain);
				data = this.data.monthly.all();
				timeOffset = d3.timeMonth;
				break;
			default:
				break;
		}

		let output = {
			dataDisplay: undefined,
			timeInRange: undefined,
			percentileDay: undefined,
		}
		//dataDisplay
		if (display == 0) {
			let results = {
				glucose: data.filter(d => d.type == this.types.glucose),
				bolus: data.filter(d => d.type == this.types.bolus),
				basal: data.filter(d => d.type == this.types.basal_temp),
				basal_profile: data.filter(d => d.type == this.types.basal_profile),
				carbs: data.filter(d => d.type == this.types.carbs),
				predictions: data.filter(d => d.type == this.types.predictions),
				glucoseDisplay: 'point',
				basalDisplay: 'line'
			}
			output.dataDisplay = results;

		} else if (display <= 2) {
			let glucose = [];
			let basal = [];
			let bolus = [];
			let carbs = [];
			data.forEach(d => {
				if (d.value.glucose.count != 0) {
					let item = {
						time: d.key,
						value: d.value.glucose.sum / d.value.glucose.count,
					}
					glucose.push(item);
				}
				if (d.value.basal.sum != 0) {
					let item = {
						time: d.key,
						value: d.value.basal.sum,
					}
					basal.push(item);
				}
				if (d.value.bolus.sum != 0) {
					let item = {
						time: d.key,
						value: d.value.bolus.sum,
					}
					bolus.push(item);
				}
				if (d.value.carbs.sum != 0) {
					let item = {
						time: d.key,
						value: d.value.carbs.sum,
					}
					carbs.push(item);
				}
			})
			output.dataDisplay = {
				glucose: glucose,
				basal: basal,
				bolus: bolus,
				carbs: carbs,
				glucoseDisplay: 'point',
				basalDisplay: 'bar',
				basalBarWidth: 10
			};
		} else if (display > 2) {
			let glucose = [];
			let basal = [];
			let bolus = [];
			let carbs = [];

			data.forEach(d => {
				if (d.value.glucose.count != 0) {
					let percentile = this.getPercentile(d.value.glucose.median_arr, d.value.glucose.count, [0.10, 0.25, 0.5, 0.75, 0.90]);
					let item = {
						timeStart: d.key,
						time: new Date(d.key.getTime() + ((timeOffset.offset(d.key, 1) - d.key.getTime()) / 2)),
						timeEnd: timeOffset.offset(d.key, 1),
						percentile: percentile
					}
					glucose.push(item);
				}
				if (d.value.basal.sum != 0) {
					let item = {
						time: d.key,
						value: d.value.basal.sum,
					}
					basal.push(item);
				}
				if (d.value.bolus.sum != 0) {
					let item = {
						time: d.key,
						value: d.value.bolus.sum,
					}
					bolus.push(item);
				}
				if (d.value.carbs.sum != 0) {
					let item = {
						time: d.key,
						value: d.value.carbs.sum,
					}
					carbs.push(item);
				}
			})
			output.dataDisplay = {
				glucose: glucose,
				basal: basal,
				bolus: bolus,
				carbs: carbs,
				glucoseDisplay: 'percentile',
				basalDisplay: 'bar',
				basalBarWidth: 30
			};
		}

		//TimeInRange
		let stats_raw = this.data.stats_range.value();
		let stats = {
			timeFrame: domain,
			glucose: {
				hypo: stats_raw.hypo / stats_raw.count,
				low: stats_raw.low / stats_raw.count,
				normal: stats_raw.normal / stats_raw.count,
				high: stats_raw.high / stats_raw.count,
				hyper: stats_raw.hyper / stats_raw.count,
				average: stats_raw.sum / stats_raw.count
			},
			glucoseLevels: this.glucoseLevels
		}
		output.timeInRange = stats;

		//Statistics
		let day = this.data.stats_range.value().stats;
		let result = [];
		if (!day) return result;
		let i;
		for (i = 0; i < day.length; i++) {
			let item = {
				time: new Date(1970, 1, 2, Math.floor(i / 6), (i % 6) * 10),
				value: this.getPercentile(day[i], day[i].reduce((p, c) => p + c), [0.10, 0.25, 0.5, 0.75, 0.90])
			}
			if(item.value){
				result.push(item);
			}
		}
		output.percentileDay = result;

		return output


	}
	getPercentile(data, count, percentile) {
		let percentile_index = [];
		percentile.forEach(d => percentile_index.push(Math.floor(d * count)));

		let results = new Array(percentile_index.length);
		let i;
		if (data) {
			for (i = 0; i < data.length; i++) {
				if (data[i]) {
					let j;
					for (j = 0; j < percentile_index.length; j++) {
						percentile_index[j] -= data[i];
						if (percentile_index[j] < 0) {
							results[j] = i;
							percentile_index[j] = Infinity;
						}
					}
				}
			}
		}
		return results;

	}
	getData() {
		return this.data;
	}

}
export default DataManager