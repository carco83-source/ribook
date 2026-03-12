// Database scuole di Catanzaro

export type SchoolType = 'primo_grado' | 'secondo_grado';

export interface School {
  id: string;
  codice: string;  // Codice ministeriale (es. CZMM86001P)
  nome: string;
  tipo: SchoolType;
  indirizzo?: string;
}

export const SCHOOL_TYPES = [
  { key: 'primo_grado', label: 'Secondaria di Primo Grado (Medie)' },
  { key: 'secondo_grado', label: 'Secondaria di Secondo Grado (Superiori)' },
];

// Scuole Secondarie di Primo Grado (Medie) - Catanzaro
// Codici ministeriali reali delle scuole di Catanzaro
export const SCUOLE_PRIMO_GRADO: School[] = [
  { id: 'pg_1', codice: 'CZMM82601C', nome: 'I.C. "Catanzaro Centro" - Scuola Media Manzoni', tipo: 'primo_grado' },
  { id: 'pg_2', codice: 'CZMM82501L', nome: 'I.C. "Catanzaro Est" - Scuola Media Ferrara', tipo: 'primo_grado' },
  { id: 'pg_3', codice: 'CZMM823014', nome: 'I.C. "Catanzaro Nord-Est" - Scuola Media Patari', tipo: 'primo_grado' },
  { id: 'pg_4', codice: 'CZMM82401T', nome: 'I.C. "Catanzaro Sala" - Scuola Media Don Milani', tipo: 'primo_grado' },
  { id: 'pg_5', codice: 'CZMM83301V', nome: 'I.C. "Catanzaro V. Catanzaro" - Scuola Media Pascoli', tipo: 'primo_grado' },
  { id: 'pg_6', codice: 'CZMM835019', nome: 'I.C. "Mattia Preti" - Scuola Media Catanzaro Lido', tipo: 'primo_grado' },
  { id: 'pg_7', codice: 'CZMM82101C', nome: 'I.C. "Catanzaro Santa Maria" - Scuola Media Santa Maria', tipo: 'primo_grado' },
  { id: 'pg_8', codice: 'CZMM86001P', nome: 'I.C. "Casalinuovo Sud" - Scuola Media', tipo: 'primo_grado' },
  { id: 'pg_9', codice: 'CZMM83401P', nome: 'I.C. "Catanzaro Vivaldi" - Scuola Media Vivaldi', tipo: 'primo_grado' },
  { id: 'pg_10', codice: 'CZMM822018', nome: 'Scuola Media Paritaria "S. Cuore"', tipo: 'primo_grado' },
];

// Scuole Secondarie di Secondo Grado (Superiori) - Catanzaro
export const SCUOLE_SECONDO_GRADO: School[] = [
  // Licei
  { id: 'sg_1', codice: 'CZPC060004', nome: 'Liceo Classico "P. Galluppi"', tipo: 'secondo_grado' },
  { id: 'sg_2', codice: 'CZPS02000R', nome: 'Liceo Scientifico "E. Fermi"', tipo: 'secondo_grado' },
  { id: 'sg_3', codice: 'CZPS03000G', nome: 'Liceo Scientifico "L. Siciliani"', tipo: 'secondo_grado' },
  { id: 'sg_4', codice: 'CZSD02000B', nome: 'Liceo Artistico "G. Catanzaro"', tipo: 'secondo_grado' },
  { id: 'sg_5', codice: 'CZPM03000C', nome: 'Liceo delle Scienze Umane "V. De Nobili"', tipo: 'secondo_grado' },
  { id: 'sg_6', codice: 'CZPS030007', nome: 'Liceo Linguistico "L. Siciliani"', tipo: 'secondo_grado' },
  { id: 'sg_7', codice: 'CZPM02000L', nome: 'Liceo Musicale e Coreutico', tipo: 'secondo_grado' },
  
  // Istituti Tecnici
  { id: 'sg_8', codice: 'CZTF010006', nome: 'I.T.I.S. "E. Scalfaro"', tipo: 'secondo_grado' },
  { id: 'sg_9', codice: 'CZTD05000N', nome: 'I.T.E. "Grimaldi - Pacioli"', tipo: 'secondo_grado' },
  { id: 'sg_10', codice: 'CZTF02000P', nome: 'I.T.T. "Ferraris" - Tecnico Tecnologico', tipo: 'secondo_grado' },
  { id: 'sg_11', codice: 'CZTA01000G', nome: 'I.T.A.S. "V. Ferraris" - Agrario', tipo: 'secondo_grado' },
  { id: 'sg_12', codice: 'CZTL01000E', nome: 'I.T.G. "R. Petrucci" - Geometri', tipo: 'secondo_grado' },
  
  // Istituti Professionali
  { id: 'sg_13', codice: 'CZRI010003', nome: 'I.P.S.I.A. "G. Ferraris" - Professionale Industria', tipo: 'secondo_grado' },
  { id: 'sg_14', codice: 'CZRH010002', nome: 'I.P.S.S.A.R. "Catanzaro" - Alberghiero', tipo: 'secondo_grado' },
  { id: 'sg_15', codice: 'CZRF01000T', nome: 'I.P.S.S. "L. Einaudi" - Servizi Sociali', tipo: 'secondo_grado' },
  { id: 'sg_16', codice: 'CZRH020007', nome: 'I.P.E.O.A. "Catanzaro" - Enogastronomia', tipo: 'secondo_grado' },
  
  // Altri
  { id: 'sg_17', codice: 'CZVC01000A', nome: 'Convitto Nazionale "P. Galluppi"', tipo: 'secondo_grado' },
  { id: 'sg_18', codice: 'CZPS025009', nome: 'Istituto Paritario "San Paolo"', tipo: 'secondo_grado' },
];

export const getSchoolsByType = (tipo: SchoolType): School[] => {
  if (tipo === 'primo_grado') {
    return SCUOLE_PRIMO_GRADO;
  }
  return SCUOLE_SECONDO_GRADO;
};

export const getAllSchools = (): School[] => {
  return [...SCUOLE_PRIMO_GRADO, ...SCUOLE_SECONDO_GRADO];
};

export const getSchoolById = (id: string): School | undefined => {
  return getAllSchools().find(school => school.id === id);
};

// Classi disponibili per tipo scuola
export const getClassiByType = (tipo: SchoolType): string[] => {
  if (tipo === 'primo_grado') {
    return ['1', '2', '3']; // Medie: 3 anni
  }
  return ['1', '2', '3', '4', '5']; // Superiori: 5 anni
};

export const SEZIONI = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
