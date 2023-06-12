import type { Signal } from "@preact/signals-react";
import React from "react";
import { signal, computed } from "@preact/signals-react";
import * as d3 from "d3";

const data_signal: Signal<any[]> = signal([]);

const data_loaded_signal: Signal<boolean> = computed(
  () => data_signal.value.length > 0
);

interface QueryObject {
  label: string;
  name: string;
  query: string;
  range_offset?: number;
  range_unit?: "day";
  range_step?: string;
}

interface PrometheusResult {
  metric: { [key: string]: string };
  value: [number, string];
}

const queries: QueryObject[] = [
  {
    label: "Free CPUs (non-GPU) by location",
    name: "cpus_free",
    query: 'sum(slurm_node_cpus{state="free",nodes!="gpu"}) by (cluster,nodes)',
  },
  {
    label: "Allocated CPUs (non-GPU) by location",
    name: "cpus_allocated",
    query:
      'sum(slurm_node_cpus{state="alloc",nodes!="gpu"}) by (cluster,nodes)',
  },
  {
    label: "Percent Free CPUs (non-GPU) by location",
    name: "cpus_percent_free",
    query:
      'sum(slurm_node_cpus{state="free",nodes!="gpu"}) by (cluster,nodes) / sum(slurm_node_cpus{nodes!="gpu"}) by (cluster,nodes)',
  },
  {
    label: "GPUs free by location",
    name: "gpus_free",
    query: 'sum(slurm_node_gpus{state="free",nodes="gpu"}) by (cluster)',
  },
  {
    label: "GPUs allocated by location",
    name: "gpus_allocated",
    query: 'sum(slurm_node_gpus{state="alloc",nodes="gpu"}) by (cluster)',
  },
  {
    label: "Slurm pending job requests",
    name: "slurm_pending_jobs",
    query: 'sum(slurm_job_count{state="pending"}) by (account)',
  },
];

const range_queries: QueryObject[] = [
  {
    label: "Rusty queue wait time over 24 hours",
    name: "rusty_wait_time",
    query:
      'sum(slurm_job_seconds{cluster="iron",state="pending"}) by (account)',
    range_offset: 1,
    range_unit: "day",
    range_step: "15m",
  },
  {
    label: "Rusty queue length over 24 hours",
    name: "rusty_queue_length",
    query: 'sum(slurm_job_count{state="pending"}) by (account)',
    range_offset: 1,
    range_unit: "day",
    range_step: "15m",
  },
  {
    label: "Node counts by center for the last 7 Days",
    name: "node_count",
    query: 'sum(slurm_job_nodes{state="running"}) by (account)',
    range_offset: 7,
    range_unit: "day",
    range_step: "90m",
  },
];

/**
 * Fetch data from Prometheus
 */
async function fetch_prometheus_data(
  query_object: QueryObject,
  is_range_query: boolean
): Promise<PrometheusResult> {
  log("Fetching data", query_object, is_range_query);
  const base = is_range_query
    ? "http://prometheus.flatironinstitute.org/api/v1/query_range"
    : "http://prometheus.flatironinstitute.org/api/v1/query";
  const url = new URL(base);
  const search_params = new URLSearchParams({
    query: query_object.query,
  });
  if (is_range_query) {
    const end = new Date();
    if (query_object.range_unit === "day") {
      const start = d3.timeDay.offset(end, -query_object.range_offset);
      search_params.set("start", start.toISOString());
      search_params.set("end", end.toISOString());
      search_params.set("step", query_object.range_step);
    }
  }
  url.search = search_params.toString();
  log("URL", url.toString());
  return await d3
    .json(url)
    .then((body) => {
      if (body.status === "success") {
        const results: PrometheusResult[] = body.data.result;
        return results;
      } else {
        throw new Error(`Prometheus error: ${body.error}`);
      }
    })
    // tslint:disable-next-line
    .catch((err) => console.log(Error(err.statusText)));
}

async function fetch_all_prometheus_data() {
  const non_range_data = queries.map(async (query_object) => ({
    query: query_object,
    data: await fetch_prometheus_data(query_object, false),
  }));

  const range_data = range_queries.map(async (query_object) => ({
    query: query_object,
    data: await fetch_prometheus_data(query_object, true),
  }));

  return Promise.all([...non_range_data, ...range_data]);
}

function log(...args) {
  console.log(`📊`, ...args);
}

export default function App() {
  React.useEffect(() => {
    log("App mounted");
    log(`Fetching data...`);
    fetch_all_prometheus_data().then((data) => {
      log("Data fetched", data);
      data_signal.value = data;
    });
  }, []);
  return <div>loaded data? {data_loaded_signal.value.toString()}</div>;
}
