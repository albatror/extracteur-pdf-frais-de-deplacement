'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AnnotationZone } from '@/lib/annotationTypes';

interface PdfAnnotationEditorProps {
  file: File;
  zones: AnnotationZone[];
  onZonesChange: (zones: AnnotationZone[]) => void;
}

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentZoneType: string;
}

export function PdfAnnotationEditor({ file, zones, onZonesChange }: PdfAnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentZoneType: 'NOM-T1'
  });
  const [scale, setScale] = useState(1.5);

  // Initialiser PDF.js
  useEffect(() => {
    const initializePdf = async () => {
      try {
        setIsLoading(true);
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setError('');
      } catch (err) {
        console.error('Erreur chargement PDF:', err);
        setError('Erreur lors du chargement du PDF');
      } finally {
        setIsLoading(false);
      }
    };

    if (file) {
      initializePdf();
    }
  }, [file]);

  // Rendre la page PDF
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Rendre la page PDF
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      // Dessiner les zones existantes
      drawExistingZones(context, viewport);
      
    } catch (err) {
      console.error('Erreur rendu page:', err);
      setError('Erreur lors du rendu de la page');
    }
  }, [pdfDoc, currentPage, scale, zones]);

  // Dessiner les zones existantes
  const drawExistingZones = (context: CanvasRenderingContext2D, viewport: any) => {
    const pageZones = zones.filter(zone => zone.pageNumber === currentPage);
    
    pageZones.forEach(zone => {
      context.strokeStyle = getZoneColor(zone.type);
      context.fillStyle = getZoneColor(zone.type) + '20'; // Transparence
      context.lineWidth = 2;
      
      // Ajuster les coordonnées pour l'échelle
      const x = zone.x * (viewport.width / (viewport.width / scale));
      const y = zone.y * (viewport.height / (viewport.height / scale));
      const width = zone.width * (viewport.width / (viewport.width / scale));
      const height = zone.height * (viewport.height / (viewport.height / scale));
      
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
      
      // Étiquette
      context.fillStyle = getZoneColor(zone.type);
      context.font = '12px Arial';
      context.fillText(zone.type, x, y - 5);
    });
  };

  // Couleurs des zones
  const getZoneColor = (type: string): string => {
    if (type.includes('NOM')) return '#ef4444'; // Rouge
    if (type.includes('PRENOM')) return '#3b82f6'; // Bleu
    if (type.includes('MONTANT')) return '#22c55e'; // Vert
    return '#6b7280'; // Gris par défaut
  };

  // Gestion du dessin
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setDrawingState({
      isDrawing: true,
      startX: x,
      startY: y,
      currentZoneType: drawingState.currentZoneType
    });
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingState.isDrawing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const endX = event.clientX - rect.left;
    const endY = event.clientY - rect.top;

    // Calculer les dimensions de la zone
    const x = Math.min(drawingState.startX, endX);
    const y = Math.min(drawingState.startY, endY);
    const width = Math.abs(endX - drawingState.startX);
    const height = Math.abs(endY - drawingState.startY);

    // Créer une nouvelle zone si elle est assez grande
    if (width > 10 && height > 10) {
      const newZone: AnnotationZone = {
        id: `zone_${Date.now()}`,
        type: drawingState.currentZoneType,
        x: x / scale,
        y: y / scale,
        width: width / scale,
        height: height / scale,
        pageNumber: currentPage,
        formType: 'TYPE1'
      };

      onZonesChange([...zones, newZone]);
    }

    setDrawingState(prev => ({ ...prev, isDrawing: false }));
  };

  // Navigation des pages
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Supprimer une zone
  const deleteZone = (zoneId: string) => {
    onZonesChange(zones.filter(zone => zone.id !== zoneId));
  };

  // Effacer toutes les zones
  const clearAllZones = () => {
    onZonesChange([]);
  };

  // Rendre la page quand elle change
  useEffect(() => {
    renderPage();
  }, [renderPage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p>Chargement du PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Contrôles */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Type de zone :</label>
          <Select
            value={drawingState.currentZoneType}
            onValueChange={(value) => setDrawingState(prev => ({ ...prev, currentZoneType: value }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOM-T1">NOM</SelectItem>
              <SelectItem value="PRENOM-T1">PRÉNOM</SelectItem>
              <SelectItem value="MONTANT A PAYER-T1">MONTANT À PAYER</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Zoom :</label>
          <Select
            value={scale.toString()}
            onValueChange={(value) => setScale(parseFloat(value))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">100%</SelectItem>
              <SelectItem value="1.5">150%</SelectItem>
              <SelectItem value="2">200%</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={clearAllZones} variant="outline" size="sm">
          🗑️ Effacer tout
        </Button>
      </div>

      {/* Navigation des pages */}
      <div className="flex items-center justify-between">
        <Button 
          onClick={goToPreviousPage} 
          disabled={currentPage <= 1}
          variant="outline"
        >
          ← Page précédente
        </Button>
        
        <span className="text-sm font-medium">
          Page {currentPage} sur {totalPages}
        </span>
        
        <Button 
          onClick={goToNextPage} 
          disabled={currentPage >= totalPages}
          variant="outline"
        >
          Page suivante →
        </Button>
      </div>

      {/* Canvas PDF */}
      <div className="border rounded-lg overflow-auto max-h-96">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          className="cursor-crosshair"
          style={{ display: 'block', maxWidth: '100%' }}
        />
      </div>

      {/* Instructions */}
      <Alert>
        <AlertDescription>
          <strong>Instructions :</strong> Cliquez et glissez pour dessiner une zone d'extraction. 
          Sélectionnez d'abord le type de zone (NOM, PRÉNOM, MONTANT À PAYER) puis dessinez sur le PDF.
        </AlertDescription>
      </Alert>

      {/* Liste des zones */}
      {zones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Zones définies ({zones.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {zones.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-2">
                    <Badge 
                      style={{ backgroundColor: getZoneColor(zone.type) + '20', color: getZoneColor(zone.type) }}
                    >
                      {zone.type}
                    </Badge>
                    <span className="text-sm">
                      Page {zone.pageNumber} - ({Math.round(zone.x)}, {Math.round(zone.y)}) 
                      {Math.round(zone.width)}×{Math.round(zone.height)}
                    </span>
                  </div>
                  <Button
                    onClick={() => deleteZone(zone.id)}
                    variant="ghost"
                    size="sm"
                  >
                    🗑️
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
