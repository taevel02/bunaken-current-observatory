import type { ResearchRelease,ResearchResults } from "@bunaken/contracts/research";
export type ResearchItem = {release:ResearchRelease;results:ResearchResults;documents:Record<string,string>;display_state:string};
export function loadResearchLibrary(options?:{owner?:string;repo?:string;fetchImpl?:typeof fetch;slug?:string;version?:string}):Promise<{status:string;items:ResearchItem[];withdrawn:{slug:string;version:string}[]}>;

export function loadResearchCatalog(options?:{offset?:number;latestPublished?:boolean}):Promise<{status:string;items:{release:ResearchRelease;display_state:string}[];withdrawn:{slug:string;version:string}[];next_offset?:number|null;partial?:boolean}>;
