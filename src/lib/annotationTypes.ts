// Types pour le système d'annotations manuelles amélioré

/**
 * Types d'annotations pour les deux types de formulaires
 */
export type AnnotationType = 
  | 'NOM-T1' 
  | 'PRENOM-T1' 
  | 'MONTANT A PAYER-T1'
  | 'NOM-T2' 
  | 'PRENOM-T2' 
  | 'MONTANT A PAYER-T2';

/**
 * Zone d'annotation avec coordonnées précises
 */
export interface AnnotationZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: AnnotationType;
  pageNumber: number;
  formType: 'type1' | 'type2';
  label: string;
}

/**
 * Preset de zones sauvegardées
 */
export interface AnnotationPreset {
  id: string;
  name: string;
  zones: AnnotationZone[];
  createdAt: Date;
  description?: string;
}

/**
 * Configuration d'extraction avec presets
 */
export interface AnnotationConfig {
  usePresets: boolean;
  selectedPresetId?: string;
  customZones: AnnotationZone[];
  enhanceImage?: boolean;
  ocrOptions?: {
    lang?: string;
    tessedit_char_whitelist?: string;
  };
}

/**
 * Résultat d'extraction basée sur les annotations
 */
export interface AnnotationExtractionResult {
  nom: string;
  prenom: string;
  montantAPayer: number;
  pageNumber: number;
  formType: 'type1' | 'type2';
  extractedText: {
    nom: string;
    prenom: string;
    montant: string;
  };
  coordinates: {
    nom: { x: number; y: number; width: number; height: number };
    prenom: { x: number; y: number; width: number; height: number };
    montant: { x: number; y: number; width: number; height: number };
  };
}

/**
 * État de l'éditeur d'annotations
 */
export interface AnnotationEditorState {
  currentPage: number;
  totalPages: number;
  selectedTool: AnnotationType | null;
  zones: AnnotationZone[];
  isDrawing: boolean;
  presets: AnnotationPreset[];
  activePreset?: AnnotationPreset;
}

/**
 * Données de canvas pour l'éditeur
 */
export interface CanvasData {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  scale: number;
  pdfPage: any; // Type PDFPageProxy
}
