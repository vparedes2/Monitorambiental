"""
Regenera los datos de Nación (Capítulo IV) que usa el monitor para los sumideros de Neuquén.

Uso (con los CSV bajados de datos.energia.gob.ar, ver data/nacion/README.md):
  python3 scripts/actualizar-nacion.py PRODUCCION_AAAA.csv capitulo-iv-pozos.csv listado-de-pozos.csv IDS_PROVINCIA.txt

IDS_PROVINCIA.txt: identificadores nacionales (UWI_SEN) de los sumideros de la capa provincial,
separados por espacios. Se obtienen de /api/neuquen/wfs/Pozos?cql=FLUIDO='SUM'&props=UWI_SEN

Salidas:
  public/capas/inyeccion-sumideros.json   inyección mensual declarada + fechas (para la ficha)
  public/capas/sumideros-nacion.geojson   sumideros de Nación que no figuran en la capa provincial
  data/nacion/*.csv                       extractos de Neuquén como registro
"""
import csv, json, sys, datetime, os
csv.field_size_limit(10**9)
prod_f, c4_f, li_f, ids_f = sys.argv[1:5]
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ids = set(open(ids_f).read().split())

# Padrón Capítulo IV: tipo, estado, fechas y coordenadas
c4, filas_c4 = {}, []
with open(c4_f, encoding="utf-8-sig") as fh:
    rd = csv.DictReader(fh)
    cols_c4 = [c for c in rd.fieldnames if c not in ("geom",)]
    for r in rd:
        if r["provincia"] != "Neuquén": continue
        filas_c4.append({c: r[c] for c in cols_c4})
        if r["tipopozo"] == "Sumidero" or r["idpozo"] in ids: c4[r["idpozo"]] = r
# Listado cargado por operadoras: fecha de abandono
li = {}
with open(li_f, encoding="utf-8-sig") as fh:
    for r in csv.DictReader(fh):
        if r["idpozo"] in c4: li[r["idpozo"]] = r

# Producción mensual: inyección de agua
pozos, filas_prod, anio, meses = {}, [], None, set()
with open(prod_f, encoding="utf-8-sig") as fh:
    rd = csv.DictReader(fh); cols_prod = rd.fieldnames
    for r in rd:
        if r["provincia"] != "Neuquén": continue
        i = r["idpozo"]
        if not (r["tipopozo"] == "Sumidero" or i in ids or i in c4): continue
        filas_prod.append(r)
        anio = int(r["anio"]); m = int(r["mes"]); meses.add(m)
        p = pozos.setdefault(i, {"sigla": r["sigla"].strip(), "empresa": r["empresa"].strip(), "tipo": r["tipopozo"], "m": {}})
        try: v = float(r["iny_agua"] or 0)
        except ValueError: v = 0
        p["m"][m] = (v, r["tipoestado"]); p["tipo"] = r["tipopozo"]; p["empresa"] = r["empresa"].strip()
# Meses completos: se descarta un último mes con muy pocas declaraciones (aún en carga)
cuenta = {m: sum(1 for p in pozos.values() if m in p["m"]) for m in meses}
ult = max(m for m in meses if cuenta[m] >= 0.8 * max(cuenta.values()))
rango = range(1, ult + 1)

f = lambda v: (v or "").strip() or None
out = {"fuente": f"Secretaría de Energía de la Nación, Producción de pozos de gas y petróleo {anio} y padrón Capítulo IV (declaraciones juradas de las operadoras)",
       "descargado": datetime.date.today().isoformat(), "desde": f"{anio}-01", "hasta": f"{anio}-{ult:02d}", "pozos": {}}
for k, p in pozos.items():
    ms = [m for m in rango if m in p["m"]]
    if not ms: continue
    r4, rl = c4.get(k, {}), li.get(k, {})
    out["pozos"][k] = {"sigla": p["sigla"], "empresa": p["empresa"], "tipo": p["tipo"], "estado": p["m"][ms[-1]][1],
                       "m3": [round(p["m"][m][0]) if m in p["m"] else None for m in rango], "prov": k in ids,
                       "inicio_perf": f(r4.get("adjiv_fecha_inicio_perf")) or f(rl.get("adjiv_fecha_inicio")),
                       "fin_term": f(r4.get("adjiv_fecha_fin_term")) or f(rl.get("adjiv_fecha_fin_term")),
                       "abandono": f(rl.get("adjiv_fecha_abandono"))}
json.dump(out, open(f"{RAIZ}/public/capas/inyeccion-sumideros.json", "w"), ensure_ascii=False, separators=(",", ":"))

# Sumideros que solo figuran en Nación
feats = []
for k, r in c4.items():
    if r["tipopozo"] != "Sumidero" or k in ids or not r["geojson"]: continue
    g = json.loads(r["geojson"]); g["coordinates"] = [round(g["coordinates"][0], 6), round(g["coordinates"][1], 6)]
    feats.append({"type": "Feature", "geometry": g, "properties": {
        "nombre": r["sigla"].strip(), "operador": r["empresa"].strip(), "area": r["area"].strip(), "yacimiento": r["yacimiento"].strip(),
        "estado": r["tipoestado"], "formacion": r["formacion"], "profundidad_m": float(r["profundidad"] or 0) or None,
        "inicio_perf": f(r["adjiv_fecha_inicio_perf"]), "fin_term": f(r["adjiv_fecha_fin_term"]), "id_nacion": int(k)}})
json.dump({"type": "FeatureCollection", "fuente": "Secretaría de Energía, padrón Capítulo IV", "features": feats},
          open(f"{RAIZ}/public/capas/sumideros-nacion.geojson", "w"), ensure_ascii=False, separators=(",", ":"))

# Registro: extractos de Neuquén
with open(f"{RAIZ}/data/nacion/neuquen-pozos-capitulo-iv.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols_c4); w.writeheader(); w.writerows(filas_c4)
with open(f"{RAIZ}/data/nacion/neuquen-sumideros-produccion-{anio}.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols_prod); w.writeheader(); w.writerows(filas_prod)
print(f"{len(out['pozos'])} pozos con inyección {out['desde']} a {out['hasta']}, {len(feats)} sumideros solo en Nación, {len(filas_c4)} pozos de Neuquén en el padrón")
