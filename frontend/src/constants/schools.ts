// Database scuole di Catanzaro - AGGIORNATO CON CODICI CORRETTI DA AIE

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
// Codici ministeriali verificati da AIE consultazione.adozioniaie.it
export const SCUOLE_PRIMO_GRADO: School[] = [
  { id: 'pg_1', codice: 'CZMM86001P', nome: 'I.C. Casalinuovo', tipo: 'primo_grado' },
  { id: 'pg_2', codice: 'CZMM856013', nome: 'I.C. Don Milani', tipo: 'primo_grado' },
  { id: 'pg_3', codice: 'CZMM85201Q', nome: 'I.C. Patari - Rodari', tipo: 'primo_grado' },
  { id: 'pg_4', codice: 'CZMM86701D', nome: 'I.C. Vivaldi', tipo: 'primo_grado' },
  { id: 'pg_5', codice: 'CZMM85801P', nome: 'I.C. Mater Domini (Lampasi)', tipo: 'primo_grado' },
  { id: 'pg_6', codice: 'CZMM00300E', nome: 'Convitto Nazionale Galluppi', tipo: 'primo_grado' },
  { id: 'pg_7', codice: 'CZMM83903B', nome: 'I.C. G. Sabatini (Caraffa)', tipo: 'primo_grado' },
  { id: 'pg_8', codice: 'CZ1MBR5002', nome: 'Scuola Maria Immacolata', tipo: 'primo_grado' },
];

// Scuole Secondarie di Secondo Grado (Superiori) - Catanzaro
// Codici ministeriali verificati da AIE consultazione.adozioniaie.it
export const SCUOLE_SECONDO_GRADO: School[] = [
  // Licei
  { id: 'sg_1', codice: 'CZPC09000X', nome: 'Liceo Classico P. Galluppi', tipo: 'secondo_grado' },
  { id: 'sg_2', codice: 'CZPS00101C', nome: 'Liceo Scientifico E. Fermi', tipo: 'secondo_grado' },
  { id: 'sg_3', codice: 'CZPS02201D', nome: 'Liceo Scientifico L. Siciliani', tipo: 'secondo_grado' },
  { id: 'sg_4', codice: 'CZSL02201A', nome: 'Liceo Artistico di Catanzaro', tipo: 'secondo_grado' },
  { id: 'sg_5', codice: 'CZPM02201E', nome: 'Liceo Linguistico G. De Nobili', tipo: 'secondo_grado' },
  
  // Istituti Tecnici
  { id: 'sg_6', codice: 'CZTF010008', nome: 'ITIS E. Scalfaro', tipo: 'secondo_grado' },
  { id: 'sg_7', codice: 'CZTD024011', nome: 'ITCG Grimaldi - Pacioli', tipo: 'secondo_grado' },
  { id: 'sg_8', codice: 'CZTA021035', nome: 'IST. Tecnico Agrario V. Emanuele II', tipo: 'secondo_grado' },
  { id: 'sg_9', codice: 'CZTE021011', nome: 'IST. Tecnico B. Chimirri', tipo: 'secondo_grado' },
  
  // Istituti Professionali
  { id: 'sg_10', codice: 'CZRI02401A', nome: 'IPSIA G. Ferraris', tipo: 'secondo_grado' },
  { id: 'sg_11', codice: 'CZRC02401N', nome: 'IPSCT Sorace Maresca', tipo: 'secondo_grado' },
  { id: 'sg_12', codice: 'CZTL02401B', nome: 'IIS Petrucci-Ferraris-Maresca', tipo: 'secondo_grado' },
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

export const getSchoolByCode = (codice: string): School | undefined => {
  return getAllSchools().find(school => school.codice === codice);
};

// Classi disponibili per tipo scuola
export const getClassiByType = (tipo: SchoolType): string[] => {
  if (tipo === 'primo_grado') {
    return ['1', '2', '3']; // Medie: 3 anni
  }
  return ['1', '2', '3', '4', '5']; // Superiori: 5 anni
};

export const SEZIONI = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'L', 'M', 'N', 'O', 'P'];
