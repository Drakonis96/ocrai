// frontend/src/components/LayoutOcr.js
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_URL = '/api';

const AREA_COLORS = {
  header: '#3b82f6',
  footer: '#a855f7',
  page_number: '#f97316',
  main_text: '#10b981',
  titles: '#ef4444',
  caption: '#14b8a6',
  references: '#8b5cf6'
};

const defaultVisibility = {
  header: false,
  footer: false,
  page_number: false,
  main_text: true,
  titles: true,
  caption: false,
  references: false
};

function LayoutOcr() {
  const [file, setFile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [availableLayouts, setAvailableLayouts] = useState([]);
  const [selectedLayout, setSelectedLayout] = useState('');
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchLayouts();
  }, []);

  const fetchLayouts = async () => {
    try {
      const res = await axios.get(`${API_URL}/layouts`);
      setAvailableLayouts(res.data.layouts || []);
    } catch (error) {
      console.error('Error fetching layouts', error);
    }
  };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0];
    setFile(selected || null);
  };

  const handleToggle = (key) => {
    setVisibility((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleProcess = async () => {
    if (!file) {
      setStatus('⚠️ Selecciona un archivo para procesar.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    setIsProcessing(true);
    setStatus('⌛ Procesando OCR y detectando áreas...');
    try {
      const res = await axios.post(`${API_URL}/layout-ocr`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setLayout(res.data.layout);
      setSelectedLayout(res.data.layout?.name || '');
      setStatus('✅ Diseño listo para revisar.');
      fetchLayouts();
    } catch (error) {
      console.error('Layout OCR error', error);
      setStatus('❌ No se pudo procesar el archivo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadLayout = async (name) => {
    if (!name) return;
    setSelectedLayout(name);
    setStatus('🔍 Cargando diseño guardado...');
    try {
      const res = await axios.get(`${API_URL}/layouts/${name}`);
      setLayout(res.data.layout);
      setStatus('✅ Diseño cargado.');
    } catch (error) {
      console.error('Error loading layout', error);
      setStatus('❌ No se pudo cargar el diseño.');
    }
  };

  const handleTextChange = (pageIndex, areaId, value) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const pages = prev.pages.map((page, idx) => {
        if (idx !== pageIndex) return page;
        const areas = page.areas.map((area) =>
          area.id === areaId ? { ...area, text: value } : area
        );
        return { ...page, areas };
      });
      return { ...prev, pages };
    });
  };

  const handleSave = async () => {
    if (!layout) return;
    const layoutName = layout.name || selectedLayout;
    setIsSaving(true);
    setStatus('💾 Guardando cambios...');
    try {
      await axios.post(`${API_URL}/layouts/${layoutName}`, layout);
      setStatus('✅ Cambios guardados.');
      fetchLayouts();
    } catch (error) {
      console.error('Error saving layout', error);
      setStatus('❌ No se pudo guardar el diseño.');
    } finally {
      setIsSaving(false);
    }
  };

  const visibleAreas = useMemo(() => {
    if (!layout || !layout.pages?.length) return [];
    const [page] = layout.pages;
    return page.areas.filter((area) => visibility[area.type]);
  }, [layout, visibility]);

  const renderLegend = () => (
    <div className="layout-legend">
      {Object.entries(AREA_COLORS).map(([key, color]) => (
        <label key={key} className="legend-item">
          <input
            type="checkbox"
            checked={visibility[key]}
            onChange={() => handleToggle(key)}
          />
          <span className="legend-color" style={{ backgroundColor: color }} />
          <span className="legend-label">{key.replace('_', ' ')}</span>
        </label>
      ))}
    </div>
  );

  const renderEditor = () => {
    if (!layout || !layout.pages?.length) {
      return (
        <div className="layout-empty">Selecciona un diseño para editar su contenido.</div>
      );
    }
    const [page] = layout.pages;
    const filteredAreas = page.areas.filter((area) => visibility[area.type]);
    if (!filteredAreas.length) {
      return (
        <div className="layout-empty">Activa al menos un tipo de área para editar.</div>
      );
    }
    return (
      <div className="editor-scroll">
        {filteredAreas.map((area) => (
          <div key={area.id} className="editor-block">
            <div className="editor-header" style={{ borderColor: AREA_COLORS[area.type] }}>
              <span className="editor-title">{area.type.replace('_', ' ')}</span>
              <span className="editor-meta">ID: {area.id}</span>
            </div>
            <textarea
              value={area.text}
              onChange={(e) => handleTextChange(0, area.id, e.target.value)}
              className="editor-textarea"
              rows={4}
            />
          </div>
        ))}
      </div>
    );
  };

  const renderPreview = () => {
    if (!layout || !layout.pages?.length) {
      return (
        <div className="layout-empty">Sube un archivo o carga un diseño guardado.</div>
      );
    }
    const [page] = layout.pages;
    const overlayAreas = page.areas.filter((area) => visibility[area.type]);
    const imageSrc = `data:image/png;base64,${page.image_base64}`;

    return (
      <div className="preview-wrapper">
        <div className="preview-canvas">
          <img src={imageSrc} alt="Página con OCR" className="preview-image" />
          {overlayAreas.map((area) => {
            const { left, top, width, height } = area.bbox;
            const style = {
              left: `${(left / page.width) * 100}%`,
              top: `${(top / page.height) * 100}%`,
              width: `${(width / page.width) * 100}%`,
              height: `${(height / page.height) * 100}%`,
              borderColor: AREA_COLORS[area.type]
            };
            return (
              <div key={area.id} className="area-box" style={style}>
                <span className="area-label" style={{ backgroundColor: AREA_COLORS[area.type] }}>
                  {area.type.replace('_', ' ')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="layout-container">
      <div className="card layout-card">
        <div className="card-header">
          <h3 className="card-title">OCR con detección de áreas</h3>
          <p className="card-subtitle">Distingue encabezados, pies, numeración, textos principales y más.</p>
        </div>
        <div className="layout-actions">
          <div className="layout-upload">
            <label className="form-label">Archivo</label>
            <input type="file" onChange={handleFileChange} />
            <button onClick={handleProcess} className="btn btn-primary" disabled={isProcessing}>
              {isProcessing ? 'Procesando...' : 'Procesar y detectar áreas'}
            </button>
          </div>
          <div className="layout-select">
            <label className="form-label">Diseños guardados</label>
            <select
              value={selectedLayout}
              onChange={(e) => handleLoadLayout(e.target.value)}
              className="form-select"
            >
              <option value="">-- Selecciona un diseño --</option>
              {availableLayouts.map((layout) => (
                <option key={layout.file} value={layout.name}>
                  {layout.name} ({layout.pages} pág.)
                </option>
              ))}
            </select>
            <button onClick={handleSave} className="btn btn-secondary" disabled={!layout || isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
        <div className="layout-status">{status}</div>
        {renderLegend()}
      </div>

      <div className="layout-grid">
        <div className="layout-panel">
          <div className="panel-header">
            <h4>Vista previa</h4>
            <p>Muestra solo las áreas activas.</p>
          </div>
          {renderPreview()}
        </div>
        <div className="layout-panel">
          <div className="panel-header">
            <h4>Editor de texto</h4>
            <p>Modifica el contenido de cada área y guarda tus cambios.</p>
          </div>
          {renderEditor()}
        </div>
      </div>
    </div>
  );
}

export default LayoutOcr;
