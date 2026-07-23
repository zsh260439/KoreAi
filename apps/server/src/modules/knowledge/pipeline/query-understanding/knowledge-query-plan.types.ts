export type KnowledgeQueryIntent =
  /** 绮剧‘鏌ヨ锛岄€氬父渚濊禆缂栧彿銆佷笓鏈夎瘝鎴栨槑纭瓧娈靛尮閰嶃€?*/
  | 'precise'
  /** 鏉′欢鏌ヨ锛岀敤鎴峰甫鏈夋棩鏈熴€佹暟瀛椼€佺増鏈€佽寖鍥存垨鏄惧紡闄愬埗銆?*/
  | 'constrained'
  /** 鎺㈢储鏌ヨ锛岀敤鎴锋洿鍏虫敞姒傚康瑙ｉ噴銆佺浉浼艰涔夋垨寮€鏀惧紡璧勬枡銆?*/
  | 'exploratory'
  /** 娣峰悎鏌ヨ锛屽悓鏃跺寘鍚簿纭嚎绱㈠拰璇箟鐞嗚В璇夋眰銆?*/
  | 'hybrid'

export type KnowledgeQueryEntityKind =
  /** 缁撴瀯鍖栨爣璇嗙锛屼緥濡傞敊璇爜銆佸崟鍙枫€佺増鏈彿銆佹枃妗ｇ紪鍙枫€?*/
  | 'identifier'
  /** 鏁板瓧瀹炰綋锛屼緥濡傚ぉ鏁般€佹鏁般€侀槇鍊笺€侀噾棰濈瓑銆?*/
  | 'number'
  /** 鏃ユ湡鎴栨椂闂村疄浣撱€?*/
  | 'date'
  /** 闇€瑕佷繚鐣欏瓧闈㈠惈涔夌殑鏅€氭湳璇€?*/
  | 'term'
  /** LLM 鏃犳硶绋冲畾褰掔被浣嗕粛鍊煎緱淇濈暀鐨勫疄浣撱€?*/
  | 'unknown'

export type KnowledgeQueryConstraintOperator =
  /** 缁撴灉蹇呴』绛変簬璇ュ€硷紝閫傚悎缂栧彿銆佺増鏈€佺姸鎬佽繖绫诲己鏉′欢銆?*/
  | 'must_equal'
  /** 缁撴灉蹇呴』鍖呭惈璇ュ€硷紝閫傚悎鐢ㄦ埛鏄庣‘瑕佹眰鍑虹幇鐨勫叧閿瘝銆?*/
  | 'must_contain'
  /** 缁撴灉鏈€濂藉寘鍚鍊硷紝浣嗕笉鑳藉洜涓虹己澶卞氨鐩存帴鎺掗櫎銆?*/
  | 'should_contain'

export type KnowledgeRetrievalMode =
  /** 绮剧‘鏌ユ壘妯″紡锛屼紭鍏堜繚鎶ょ紪鍙枫€佷唬鐮併€佸紩鍙疯瘝绛夊瓧闈㈠尮閰嶃€?*/
  | 'exact_lookup'
  /** 鍏抽敭璇嶅寮烘ā寮忥紝鍋忓悜 BM25 浣嗕繚鐣欏悜閲忓彫鍥炲厹搴曘€?*/
  | 'keyword_heavy'
  /** 娴佺▼澧炲己妯″紡锛岄€傚悎姝ラ銆佹帓鏌ャ€佸鐞嗘柟娉曠被闂銆?*/
  | 'procedure_heavy'
  /** 鍧囪　妯″紡锛孊M25 涓庡悜閲忔寜杩愯閰嶇疆骞宠　铻嶅悎銆?*/
  | 'balanced'
  /** 璇箟澧炲己妯″紡锛岄€傚悎姒傚康銆佽В閲娿€佸紑鏀惧紡鐩镐技璇箟鏌ヨ銆?*/
  | 'semantic_heavy'

export type KnowledgeQueryRouteSource =
  /** 鐢辨湰鍦扮‘瀹氭€ц鍒欎骇鐢熺殑璺敱鏉ユ簮銆?*/
  | 'rule'
  /** 鐢?LLM 鍒嗘瀽淇″彿杈呭姪浜х敓鐨勮矾鐢辨潵婧愩€?*/
  | 'llm'
  /** 鐢辨湰鍦伴粯璁ょ瓥鐣ヤ骇鐢熺殑璺敱鏉ユ簮銆?*/
  | 'policy'
  /** 涓绘绱㈣川閲忎笉瓒虫椂浣跨敤鐨勫厹搴曟潵婧愩€?*/
  | 'fallback'

export type KnowledgeQueryRouteConfidence =
  /** 楂樼疆淇★紝閫氬父鏉ヨ嚜鏄庣‘缂栧彿銆侀敊璇爜銆佸紩鍙疯瘝绛夌‘瀹氭€т俊鍙枫€?*/
  | 'high'
  /** 涓疆淇★紝閫氬父鏉ヨ嚜娴佺▼闂硶銆佺煭 query 鎴?LLM 鍒嗘瀽淇″彿銆?*/
  | 'medium'
  /** 浣庣疆淇★紝閫氬父琛ㄧず鍙兘璧伴粯璁ゅ潎琛＄瓥鐣ャ€?*/
  | 'low'

export type KnowledgeQueryEntity = {
  /** 瀹炰綋绫诲瀷锛岀敤浜庡尯鍒嗘爣璇嗙銆佹暟瀛椼€佹棩鏈熴€佹湳璇瓑銆?*/
  kind: KnowledgeQueryEntityKind
  /** 鐢ㄦ埛 query 涓嚭鐜扮殑鍘熷鏂囨湰鐗囨銆?*/
  surface: string
  /** 褰掍竴鍖栧悗鐨勫疄浣撴枃鏈紝鍚庣画妫€绱㈠拰淇濇姢璇嶄娇鐢ㄨ繖涓€笺€?*/
  canonicalForm: string
}

export type KnowledgeQueryConstraint = {
  /** 绾︽潫鎿嶄綔绗︼紝鍐冲畾璇ョ害鏉熺敤浜庡寮恒€佷繚鎶よ繕鏄檷鏉冦€?*/
  operator: KnowledgeQueryConstraintOperator
  /** 绾︽潫鍊硷紝渚嬪蹇呴』鍖呭惈鐨勬湳璇€佸繀椤绘帓闄ょ殑璇嶃€佺増鏈彿绛夈€?*/
  value: string
}

// 瑙勫垯灞傚厛浜у嚭缁撴瀯鍖栦俊鍙凤紝閬垮厤涓€涓婃潵灏辨妸鍙洖鍐崇瓥浜ょ粰 LLM銆?
export type KnowledgeQueryRuleSignal = {
  /** 瑙勫垯灞傚缓璁殑鍙洖妯″紡銆?*/
  route: KnowledgeRetrievalMode
  /** 瑙勫垯灞傚缓璁殑缃俊搴︺€?*/
  confidence: KnowledgeQueryRouteConfidence
  /** 鍥哄畾涓?rule锛岃〃绀鸿淇″彿鏉ヨ嚜鏈湴瑙勫垯銆?*/
  source: 'rule'
  /** 鍛戒腑瑙勫垯鐨勫師鍥犲垪琛紝鐢ㄤ簬 debug 灞曠ず鍜岄棶棰樻帓鏌ャ€?*/
  reasons: string[]
  /** 浠?query 涓彁鍙栧嚭鐨勭簿纭繚鎶よ瘝锛屼緥濡傜紪鍙枫€侀敊璇爜銆佸紩鍙疯瘝銆?*/
  exactTerms: string[]
  /** 鏄惁鏄煭 query锛岀煭 query 閫氬父鏇翠緷璧栧叧閿瘝鍙洖銆?*/
  shortQuery: boolean
  /** 鏄惁鍍忔祦绋嬨€佹帓鏌ャ€佹楠ょ被闂硶銆?*/
  procedureLike: boolean
}

// 鏈€缁堣矾鐢卞喅绛栦粛鐒舵槸鏈湴浠ｇ爜缁欏嚭鐨勶紝涓嶇洿鎺ヤ俊浠?LLM 杈撳嚭銆?
export type KnowledgeQueryRouteDecision = {
  /** 鏈€缁堥噰鐢ㄧ殑鍙洖妯″紡銆?*/
  mode: KnowledgeRetrievalMode
  /** 鏈€缁堣矾鐢辨潵婧愶紝璇存槑鏄鍒欍€丩LM 杈呭姪銆佹湰鍦扮瓥鐣ヨ繕鏄厹搴曘€?*/
  source: KnowledgeQueryRouteSource
  /** 鏈€缁堣矾鐢辩疆淇″害銆?*/
  confidence: KnowledgeQueryRouteConfidence
  /** 鏈€缁堣矾鐢卞師鍥狅紝渚夸簬 debug 闈㈡澘璇存槑涓轰粈涔堣蛋杩欎釜妯″紡銆?*/
  reason: string
}

// 妫€绱㈢瓥鐣ヤ笉浠呭寘鍚潈閲嶏紝涔熷寘鍚€欓€夐泦瑙勬ā锛屼究浜?exact / fallback 浣跨敤涓嶅悓绛栫暐銆?
export type KnowledgeQueryRetrievalHints = {
  /** 褰撳墠妫€绱㈡墽琛屼娇鐢ㄧ殑鍙洖妯″紡銆?*/
  mode: KnowledgeRetrievalMode
  /** 褰撳墠妫€绱㈡墽琛岀殑绛栫暐鏉ユ簮銆?*/
  source: KnowledgeQueryRouteSource
  /** 褰撳墠妫€绱㈡墽琛岀殑绛栫暐缃俊搴︺€?*/
  confidence: KnowledgeQueryRouteConfidence
  /** BM25 铻嶅悎鏉冮噸锛岀敱鏈湴绛栫暐鏄犲皠锛屼笉鐢?LLM 鐩存帴鍐冲畾銆?*/
  bm25Weight: number
  /** 鍚戦噺铻嶅悎鏉冮噸锛岀敱鏈湴绛栫暐鏄犲皠锛屼笉鐢?LLM 鐩存帴鍐冲畾銆?*/
  vectorWeight: number
  /** 鍩轰簬 topK 鏀惧ぇ鐨勫€欓€夐泦鍊嶆暟锛岀敤鏉ユ帶鍒跺彫鍥炲€欓€夎妯°€?*/
  candidateMultiplier: number
  /** 鍊欓€夐泦涓嬮檺锛岄伩鍏?topK 寰堝皬鏃跺€欓€夎繃灏戙€?*/
  minCandidateLimit: number
  /** 鍊欓€夐泦涓婇檺锛岄伩鍏嶄竴娆″彫鍥炴媺鍙栬繃澶?chunk銆?*/
  maxCandidateLimit: number
}

export type KnowledgeQueryComplexity =
  /** 鍗曚簨瀹為棶棰橈紝閫氬父鍙渶瑕佸皯閲忚瘉鎹嵆鍙洖绛斻€?*/
  | 'single_fact'
  /** 澶氫簨瀹為棶棰橈紝闇€瑕佸涓簨瀹炴Ы浣嶅悓鏃惰鐩栥€?*/
  | 'multi_fact'
  /** 闇€瑕佽鍒欍€佹爣鍑嗐€佽鏄庣被鏀拺鏂囨。鍙備笌鐨勫弬鑰冨瀷闂銆?*/
  | 'reference_required'
  /** 璇佹嵁缂哄け椋庨櫓鏇撮珮鐨勯珮绾︽潫闂銆?*/
  | 'high_constraint'

export type KnowledgeQueryEvidencePlan = {
  /** 缁撴瀯鍖栫紪鍙枫€佺増鏈€侀敊璇爜绛夊繀椤讳紭鍏堣鐩栫殑绮剧‘鏍囪瘑銆?*/
  identifiers: string[]
  /** query 涓嚭鐜扮殑鏁板瓧銆侀槇鍊笺€佹椂闂淬€佹鏁扮瓑浜嬪疄妲戒綅銆?*/
  numericTerms: string[]
  /** 鐢ㄦ埛瀹為檯璇锋眰鐨勫瓧娈垫Ы浣嶏紝鍙湁瀛楁鏍囩闄勮繎瀛樺湪鍏蜂綋鍊兼椂鎵嶇畻瑕嗙洊銆?*/
  fieldSlots: string[]
  /** 鐢ㄤ簬鍒ゆ柇 chunk 鏄惁瑕嗙洊鍏抽敭璇佹嵁鐨勫瓧娈?鏈璇嶃€?*/
  evidenceTerms: string[]
  /** 鐢ㄤ簬瑙﹀彂 reference/standard/playbook 绛夋敮鎾戞枃妗ｇ殑閫氱敤姒傚康璇嶃€?*/
  referenceTerms: string[]
  /** query 澶嶆潅搴︼紝鐢ㄤ簬鍔ㄦ€佷笂涓嬫枃棰勭畻鍜岃瘉鎹棬绂併€?*/
  complexity: KnowledgeQueryComplexity
  /** 鏄惁闇€瑕佸弬鑰?鏍囧噯/瑙勫垯绫绘枃妗ｄ竴璧峰弬涓庡洖绛斻€?*/
  needsReference: boolean
  /** 褰撳墠闂寤鸿杩斿洖缁欑敓鎴愬眰鐨?chunk 鏁般€?*/
  targetTopK: number
  /** 褰撳墠闂鍏佽鐨勬渶澶т笂涓嬫枃 chunk 鏁般€?*/
  maxTopK: number
  /** 姝ｅ父鍥炵瓟鍓嶅缓璁揪鍒扮殑璇佹嵁瑕嗙洊鐜囥€?*/
  requiredCoverage: number
  /** 浣庝簬璇ヨ鐩栫巼鏃跺簲鎷掔粷纭畾鎬у洖绛斻€?*/
  hardGateCoverage: number
}

export type KnowledgeQueryAnalysisInput = {
  /** 鐢ㄦ埛杈撳叆鐨勫師濮?query锛屼繚鐣欑粰 LLM 鍒嗘瀽鍜?debug 灞曠ず銆?*/
  originalQuery: string
  /** 褰掍竴鍖栧悗鐨?query锛屽彧鍋氭枃鏈竻娲楋紝涓嶅仛璇箟鏀瑰啓銆?*/
  normalizedQuery: string
}

export type KnowledgeQueryAnalysis = {
  /** LLM 瀵?query 鎰忓浘鐨勫垎绫伙紝鍙綔涓烘湰鍦拌矾鐢辩殑杈撳叆淇″彿銆?*/
  intent: KnowledgeQueryIntent
  /** LLM 缁欏嚭鐨勬剰鍥捐鏄庯紝鐢ㄤ簬 debug锛屼笉鐩存帴鍙備笌鏉冮噸鍐崇瓥銆?*/
  intentReason: string
  /** 鏄惁闇€瑕佺簿纭尮閰嶏紝true 鏃舵湰鍦扮瓥鐣ュ彲閫夋嫨 exact_lookup銆?*/
  needsExactMatch: boolean
  /** 鏄惁闇€瑕佹祦绋?姝ラ绫诲洖绛旓紝true 鏃舵湰鍦扮瓥鐣ュ彲閫夋嫨 procedure_heavy銆?*/
  needsProcedure: boolean
  /** 闈㈠悜 BM25 鐨勫叧閿瘝鐭鎵╁睍銆?*/
  searchPhrases: string[]
  /** 闈㈠悜鍚戦噺鍙洖鐨勮涔夋敼鍐?query銆?*/
  semanticQueries: string[]
  /** 蹇呴』淇濈暀鐨勮瘝锛屼細杩涘叆 protectedTerms 鍜?BM25 query銆?*/
  requiredTerms: string[]
  /** 鍙€夊寮鸿瘝锛屽彧鎵╁睍鍙洖锛屼笉浣滀负蹇呴』鍛戒腑鏉′欢銆?*/
  optionalTerms: string[]
  /** 搴旈伩鍏嶇殑璇嶏紝鍚庣画鍙仛鎺掑簭闄嶆潈锛屼笉鍋氱‖杩囨护銆?*/
  excludedTerms: string[]
  /** LLM 鎶藉彇鍑虹殑瀹炰綋鍒楄〃锛岀敤浜庤ˉ鍏?protectedTerms 鍜?debug銆?*/
  entities: KnowledgeQueryEntity[]
  /** LLM 鎶藉彇鍑虹殑姝ｅ悜缁撴瀯鍖栫害鏉燂紝鍚庣画鏄犲皠涓轰繚鎶よ瘝鎴栨墿灞曡瘝銆?*/
  constraints: KnowledgeQueryConstraint[]
}

export type KnowledgeQueryPlan = {
  /** 鐢ㄦ埛杈撳叆鐨勫師濮?query銆?*/
  originalQuery: string
  /** 褰掍竴鍖栧悗鐨?query銆?*/
  normalizedQuery: string
  /** 鏈€缁堜紶缁?BM25 鐨勬绱?query銆?*/
  bm25Query: string
  /** 鏈€缁堜紶缁欏悜閲忓彫鍥炵殑妫€绱?query銆?*/
  vectorQuery: string
  /** 鏄惁鎵ц杩?LLM query analysis銆?*/
  rewriteApplied: boolean
  /** LLM query analysis 缁撴灉锛涙湭鍚敤銆佸け璐ユ垨楂樼疆淇¤鍒欒烦杩囨椂涓?null銆?*/
  analysis: KnowledgeQueryAnalysis | null
  /** 鏈湴瑙勫垯灞傝緭鍑虹殑鍓嶇疆淇″彿銆?*/
  ruleSignal: KnowledgeQueryRuleSignal
  /** 鏈湴鏈€缁堣矾鐢卞喅绛栥€?*/
  routeDecision: KnowledgeQueryRouteDecision
  /** 閫忎紶 LLM 鎶藉彇瀹炰綋锛屼究浜?debug 鍜屽悗缁墿灞曘€?*/
  entities: KnowledgeQueryEntity[]
  /** 閫忎紶 LLM 鎶藉彇绾︽潫锛屼究浜?debug 鍜屽悗缁墿灞曘€?*/
  constraints: KnowledgeQueryConstraint[]
  /** 闇€瑕佷紭鍏堜繚鎶ょ殑绮剧‘璇嶏紝鐢ㄤ簬 fallback 鍒ゆ柇鍜岀‘瀹氭€ч噸鎺掋€?*/
  protectedTerms: string[]
  /** 闇€瑕佸湪鎺掑簭闃舵闄嶆潈鐨勬帓闄よ瘝銆?*/
  excludedTerms: string[]
  /** 鍛戒腑鐨勭敤鎴峰彲閰嶇疆 query mapping 瑙﹀彂璇嶃€?*/
  appliedQueryMappings: string[]
  /** query mapping 杩藉姞鍒板彫鍥炲眰鐨勬墿灞曡瘝銆?*/
  queryMappingTerms: string[]
  /** 浼氳瘽鐭湡璁板繂杩藉姞鍒板彫鍥炲眰鐨勬彁绀鸿瘝銆?*/
  retrievalHintTerms: string[]
  /** 鍥犳湰杞樉寮忓璞′紭鍏堣€屼涪寮冪殑浼氳瘽璁板繂鎻愮ず璇嶃€?*/
  droppedRetrievalHintTerms: string[]
  /** 鏈疆鏄惧紡瀵硅薄涓庝細璇濊蹇嗗璞℃槸鍚﹀彂鐢熷啿绐併€?*/
  retrievalHintConflict: boolean
  /** 璇佹嵁椹卞姩妫€绱㈣鍒掞紝渚涢噸鎺掋€佷笂涓嬫枃缁勮鍜岀敓鎴愰棬绂佸鐢ㄣ€?*/
  evidencePlan: KnowledgeQueryEvidencePlan
  /** 涓绘绱㈡墽琛岀瓥鐣ャ€?*/
  retrieval: KnowledgeQueryRetrievalHints
  /** 澶囩敤鍧囪　妫€绱㈢瓥鐣ワ紱涓荤瓥鐣ヤ负 balanced 鏃朵负绌恒€?*/
  fallbackRetrieval: KnowledgeQueryRetrievalHints | null
}


