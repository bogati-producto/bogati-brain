"use client";

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';

export default function BrainGraph({ data, onNodeClick }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!data || !data.nodes || data.nodes.length === 0) return;
    
    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    // Zoom setup
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    const g = svg.append("g");

    // Simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(40));

    // Links
    const link = g.append("g")
      .selectAll("line")
      .data(data.links)
      .join("line")
      .attr("stroke", "rgba(38, 197, 243, 0.3)") // #26C5F3 with opacity
      .attr("stroke-width", 2);

    // Nodes
    const node = g.append("g")
      .selectAll("g")
      .data(data.nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(drag(simulation))
      .on("click", (event, d) => {
        if (onNodeClick) onNodeClick(d);
      });

    // Node circles
    node.append("circle")
      .attr("r", d => d.id === 'BOGATI_BRAIN' ? 25 : 15)
      .attr("fill", d => d.id === 'BOGATI_BRAIN' ? "#B429F9" : "#26C5F3")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.3);
      
    // Glow effect for hub
    node.filter(d => d.id === 'BOGATI_BRAIN')
      .append("circle")
      .attr("r", 35)
      .attr("fill", "none")
      .attr("stroke", "#B429F9")
      .attr("stroke-width", 2)
      .style("opacity", 0.5)
      .style("animation", "pulse 2s infinite");

    // Labels
    node.append("text")
      .text(d => d.label)
      .attr("x", 20)
      .attr("y", 5)
      .style("fill", "#ffffff")
      .style("font-size", "12px")
      .style("font-family", "sans-serif")
      .style("pointer-events", "none")
      .style("text-shadow", "0px 2px 4px rgba(0,0,0,0.8)");

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Handle Resize
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.attr("width", w).attr("height", h).attr("viewBox", [0, 0, w, h]);
      simulation.force("center", d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      simulation.stop();
      window.removeEventListener('resize', handleResize);
    };
  }, [data]);

  // Drag functionality
  function drag(simulation) {
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[#03001C] overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}} />
    </div>
  );
}
