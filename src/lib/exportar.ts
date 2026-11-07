import type { Map as MLMap } from "maplibre-gl";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/** Firma del autor en todo lo que se exporta */
export const AUTOR = {
  nombre: "Lic. Víctor Paredes",
  rol: "Higiene y Seguridad Laboral",
  web: "victorparedes.ar",
  aviso: "Herramienta de apoyo: los resultados son indicios satelitales a verificar en campo, no dictámenes técnicos."
};

export interface ItemLeyenda {
  color: string;
  texto: string;
  forma?: "cuadro" | "circulo" | "linea";
}

/** Captura el mapa tal como se ve (incluye la imagen procesada y las capas) */
export function capturarMapa(map: MLMap): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("El mapa no terminó de dibujarse.")), 8000);
    map.once("render", () => {
      try {
        const gl = map.getCanvas();
        const c = document.createElement("canvas");
        c.width = gl.width;
        c.height = gl.height;
        c.getContext("2d")!.drawImage(gl, 0, 0);
        // Marcadores HTML (satélites) que no forman parte del canvas
        const ctx = c.getContext("2d")!;
        const escala = gl.width / gl.getBoundingClientRect().width;
        const base = gl.getBoundingClientRect();
        map.getContainer().querySelectorAll<HTMLElement>(".maplibregl-marker").forEach((el) => {
          const r = el.getBoundingClientRect();
          const x = (r.left - base.left) * escala;
          const y = (r.top + r.height / 2 - base.top) * escala;
          if (x < 0 || y < 0 || x > c.width || y > c.height) return;
          const color = (el.querySelector("span") as HTMLElement | null)?.style.borderColor || "#8FE3F0";
          ctx.save();
          ctx.translate(x + 6 * escala, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = "#12100E";
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 * escala;
          ctx.fillRect(-4 * escala, -4 * escala, 8 * escala, 8 * escala);
          ctx.strokeRect(-4 * escala, -4 * escala, 8 * escala, 8 * escala);
          ctx.restore();
          const txt = (el.textContent || "").trim();
          if (txt) {
            ctx.font = `500 ${11 * escala}px "IBM Plex Mono", monospace`;
            ctx.fillStyle = color;
            ctx.shadowColor = "#12100E";
            ctx.shadowBlur = 4 * escala;
            ctx.fillText(txt, x + 16 * escala, y + 4 * escala);
            ctx.shadowBlur = 0;
          }
        });
        clearTimeout(timeout);
        resolve(c);
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
      }
    });
    map.triggerRepaint();
  });
}

const fechaHora = () =>
  new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23" } as Intl.DateTimeFormatOptions);

/** Compone una lámina: encabezado, mapa, leyenda y pie con firma */
export function componerLamina(mapa: HTMLCanvasElement, opts: { titulo: string; subtitulo?: string; leyenda?: ItemLeyenda[]; centro?: { lat: number; lon: number } }): HTMLCanvasElement {
  const W = Math.max(1200, mapa.width);
  const k = W / 1200;
  const altoMapa = Math.round((mapa.height / mapa.width) * W);
  const filasLeyenda = opts.leyenda?.length ? Math.ceil(opts.leyenda.length / 2) : 0;
  const altoLeyenda = filasLeyenda ? (24 + filasLeyenda * 24) * k : 0;
  const H = Math.round(96 * k + altoMapa + altoLeyenda + 64 * k);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#12100E";
  g.fillRect(0, 0, W, H);

  // Encabezado
  g.fillStyle = "#EEE7DB";
  g.font = `600 ${30 * k}px "Saira Condensed", "Arial Narrow", sans-serif`;
  g.fillText(opts.titulo, 28 * k, 44 * k);
  g.fillStyle = "#A89C8C";
  g.font = `${15 * k}px "IBM Plex Sans", Arial, sans-serif`;
  g.fillText(opts.subtitulo ?? "", 28 * k, 72 * k);
  g.textAlign = "right";
  g.font = `${13 * k}px "IBM Plex Mono", monospace`;
  g.fillText(fechaHora(), W - 28 * k, 44 * k);
  if (opts.centro) g.fillText(`${opts.centro.lat.toFixed(4)}°, ${opts.centro.lon.toFixed(4)}°`, W - 28 * k, 72 * k);
  g.textAlign = "left";

  // Mapa
  const yMapa = 96 * k;
  g.drawImage(mapa, 0, yMapa, W, altoMapa);
  g.strokeStyle = "#3A332B";
  g.strokeRect(0.5, yMapa + 0.5, W - 1, altoMapa - 1);

  // Leyenda
  let y = yMapa + altoMapa + 24 * k;
  (opts.leyenda ?? []).forEach((it, i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = 28 * k + col * (W / 2);
    const yy = y + fila * 24 * k;
    g.fillStyle = it.color;
    g.strokeStyle = it.color;
    if (it.forma === "circulo") {
      g.lineWidth = 2.5 * k;
      g.beginPath();
      g.arc(x + 7 * k, yy - 5 * k, 6 * k, 0, Math.PI * 2);
      g.stroke();
    } else if (it.forma === "linea") {
      g.lineWidth = 3 * k;
      g.beginPath();
      g.moveTo(x, yy - 5 * k);
      g.lineTo(x + 16 * k, yy - 5 * k);
      g.stroke();
    } else {
      g.fillRect(x, yy - 12 * k, 14 * k, 14 * k);
    }
    g.fillStyle = "#D6E0EA";
    g.font = `${13 * k}px "IBM Plex Sans", Arial, sans-serif`;
    g.fillText(it.texto.slice(0, 80), x + 24 * k, yy);
  });

  // Pie con firma
  const yPie = H - 40 * k;
  g.fillStyle = "#1C1915";
  g.fillRect(0, H - 64 * k, W, 64 * k);
  g.fillStyle = "#C9A46A";
  g.font = `600 ${14 * k}px "IBM Plex Sans", Arial, sans-serif`;
  g.fillText(`${AUTOR.nombre}, ${AUTOR.rol}`, 28 * k, yPie);
  g.fillStyle = "#A89C8C";
  g.font = `${12 * k}px "IBM Plex Sans", Arial, sans-serif`;
  g.fillText(`${AUTOR.web}  |  ${AUTOR.aviso}`, 28 * k, yPie + 20 * k);
  return c;
}

export function descargarCanvas(c: HTMLCanvasElement, nombre: string) {
  c.toBlob((b) => {
    if (!b) return;
    descargarBlob(b, nombre);
  }, "image/png");
}

export function descargarBlob(b: Blob, nombre: string) {
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function descargarTexto(texto: string, nombre: string, tipo: string) {
  descargarBlob(new Blob([texto], { type: tipo }), nombre);
}

export const nombreArchivo = (base: string, ext: string) =>
  `${base}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;

/** jsPDF con fuentes estándar no tiene subíndices ni algunos símbolos */
const pdfTexto = (t: string) =>
  t.replace(/₂/g, "2").replace(/₄/g, "4").replace(/₃/g, "3").replace(/[−–]/g, "-").replace(/≥/g, ">=").replace(/≤/g, "<=")
    .replace(/≈/g, "aprox. ").replace(/→/g, "->").replace(/µ/g, "u").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

export interface SeccionInforme {
  titulo: string;
  texto?: string[];
  tabla?: { columnas: string[]; filas: (string | number)[][] };
}

/** Informe PDF A4 apaisado: portada con mapa, secciones con tablas y pie firmado */
export function generarInformePDF(opts: { titulo: string; subtitulo?: string; mapa?: HTMLCanvasElement; leyenda?: ItemLeyenda[]; secciones: SeccionInforme[]; metodo?: string; archivo: string }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;

  doc.setFillColor(10, 22, 40);
  doc.rect(0, 0, W, 24, "F");
  doc.setTextColor(232, 238, 244);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(pdfTexto(opts.titulo), M, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(139, 160, 182);
  if (opts.subtitulo) doc.text(pdfTexto(opts.subtitulo), M, 18);
  doc.text(fechaHora(), W - M, 11, { align: "right" });

  let y = 30;
  if (opts.mapa) {
    const maxW = W - 2 * M;
    const maxH = H - 30 - 34;
    let w = maxW;
    let h = (opts.mapa.height / opts.mapa.width) * w;
    if (h > maxH) { h = maxH; w = (opts.mapa.width / opts.mapa.height) * h; }
    doc.addImage(opts.mapa.toDataURL("image/jpeg", 0.88), "JPEG", M, y, w, h);
    y += h + 5;
    if (opts.leyenda?.length) {
      doc.setFontSize(8.5);
      let x = M;
      opts.leyenda.forEach((it) => {
        const ancho = doc.getTextWidth(pdfTexto(it.texto)) + 10;
        if (x + ancho > W - M) { x = M; y += 5; }
        const [r, g, b] = hexRgb(it.color);
        doc.setDrawColor(r, g, b);
        doc.setFillColor(r, g, b);
        if (it.forma === "circulo") { doc.setLineWidth(0.6); doc.circle(x + 1.8, y - 1.2, 1.6, "S"); }
        else doc.rect(x, y - 3, 3.6, 3.6, "F");
        doc.setTextColor(50, 60, 75);
        doc.text(pdfTexto(it.texto), x + 5.5, y);
        x += ancho + 4;
      });
    }
    doc.addPage();
    y = 18;
  }

  doc.setTextColor(20, 30, 45);
  for (const sec of opts.secciones) {
    if (y > H - 40) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.text(pdfTexto(sec.titulo), M, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const parrafo of sec.texto ?? []) {
      const lineas = doc.splitTextToSize(pdfTexto(parrafo), W - 2 * M);
      if (y + lineas.length * 4.6 > H - 22) { doc.addPage(); y = 18; }
      doc.text(lineas, M, y);
      y += lineas.length * 4.6 + 2;
    }
    if (sec.tabla) {
      autoTable(doc, {
        startY: y,
        head: [sec.tabla.columnas.map(pdfTexto)],
        body: sec.tabla.filas.map((f) => f.map((v) => pdfTexto(String(v)))),
        margin: { left: M, right: M, bottom: 20 },
        styles: { fontSize: 8.5, cellPadding: 1.6 },
        headStyles: { fillColor: [15, 32, 53], textColor: [232, 238, 244] },
        alternateRowStyles: { fillColor: [242, 245, 248] }
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
    y += 3;
  }
  if (opts.metodo) {
    if (y > H - 40) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("Método y fuentes", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const l = doc.splitTextToSize(pdfTexto(opts.metodo), W - 2 * M);
    doc.text(l, M, y);
  }

  // Pie firmado en todas las páginas
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(201, 164, 106);
    doc.setLineWidth(0.4);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120, 95, 50);
    doc.text(pdfTexto(`${AUTOR.nombre}, ${AUTOR.rol}  |  ${AUTOR.web}`), M, H - 9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 120, 135);
    doc.text(pdfTexto(AUTOR.aviso), M, H - 5);
    doc.text(`${i} / ${n}`, W - M, H - 9, { align: "right" });
  }
  doc.save(opts.archivo);
}

function hexRgb(h: string): [number, number, number] {
  const m = h.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [120, 120, 120];
}

/** Focos como KML para abrir en Google Earth */
export function focosKml(focos: { lat: number; lon: number; frp: number; fecha: string; sensor: string; match: boolean; instalacion?: string }[]) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const pm = focos.map((f) => `  <Placemark>
    <name>${esc(`${f.frp.toFixed(1)} MW, ${f.fecha}`)}</name>
    <description>${esc(`${f.sensor}. ${f.match ? `Asociado a ${f.instalacion ?? "instalación"}` : "Sin instalación catastrada cerca"}. Fuente: NASA FIRMS.`)}</description>
    <styleUrl>#foco</styleUrl>
    <Point><coordinates>${f.lon},${f.lat},0</coordinates></Point>
  </Placemark>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Focos térmicos NASA FIRMS, Vaca Muerta</name>
  <description>${esc(`Exportado ${fechaHora()}. ${AUTOR.nombre}, ${AUTOR.web}`)}</description>
  <Style id="foco"><IconStyle><color>ff3d8aff</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/firedept.png</href></Icon></IconStyle></Style>
${pm}
</Document>
</kml>`;
}

export function focosCsv(focos: { lat: number; lon: number; frp: number; fecha: string; sensor: string; match: boolean; instalacion?: string; estado?: string }[]) {
  const filas = focos.map((f) => [f.fecha, f.sensor, f.lat.toFixed(5), f.lon.toFixed(5), f.frp.toFixed(2), f.match ? "asociado" : "sin instalación cerca", f.instalacion ?? ""]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return "﻿" + ["fecha_utc,sensor,latitud,longitud,frp_mw,clasificacion,instalacion", ...filas].join("\n");
}
