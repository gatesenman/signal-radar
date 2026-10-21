// 行业分类库：GICS（2023 版）11 个板块 / 74 个行业，映射到中国《国民经济行业分类》GB/T 4754-2017 门类
// 每项：[GICS 行业代码, 英文名, 中文名, GB/T 4754 门类, 英文关键词, 中文关键词]
const SECTORS = { '10': ['Energy', '能源'], '15': ['Materials', '原材料'], '20': ['Industrials', '工业'], '25': ['Consumer Discretionary', '可选消费'], '30': ['Consumer Staples', '日常消费'], '35': ['Health Care', '医疗保健'], '40': ['Financials', '金融'], '45': ['Information Technology', '信息技术'], '50': ['Communication Services', '通信服务'], '55': ['Utilities', '公用事业'], '60': ['Real Estate', '房地产'] };
const GB = { A: '农、林、牧、渔业', B: '采矿业', C: '制造业', D: '电力、热力、燃气及水生产和供应业', E: '建筑业', F: '批发和零售业', G: '交通运输、仓储和邮政业', H: '住宿和餐饮业', I: '信息传输、软件和信息技术服务业', J: '金融业', K: '房地产业', L: '租赁和商务服务业', M: '科学研究和技术服务业', N: '水利、环境和公共设施管理业', O: '居民服务、修理和其他服务业', P: '教育', Q: '卫生和社会工作', R: '文化、体育和娱乐业', S: '公共管理、社会保障和社会组织', T: '国际组织' };
const L = [
['101010', 'Energy Equipment & Services', '能源设备与服务', 'B', 'oilfield,drilling rig,offshore drilling,oil services,fracking,well services,pipeline inspection', '油服,钻井,油田服务,压裂,海上钻井'],
['101020', 'Oil, Gas & Consumable Fuels', '石油、天然气与消费用燃料', 'B', 'oil,crude,natural gas,lng,opec,refinery,coal,petroleum,shale,brent,gasoline,diesel', '石油,原油,天然气,炼油,煤炭,成品油,页岩气'],
['151010', 'Chemicals', '化学品', 'C', 'chemical,chemicals,polymer,fertilizer,specialty chemicals,petrochemical,plastics,coatings,catalyst', '化工,化学品,化肥,聚合物,石化,涂料,催化剂,新材料'],
['151020', 'Construction Materials', '建筑材料', 'C', 'cement,concrete,aggregates,building materials,asphalt,low-carbon cement', '水泥,混凝土,建材,砂石,玻璃'],
['151030', 'Containers & Packaging', '容器与包装', 'C', 'packaging,containers,cardboard,corrugated,plastic packaging,sustainable packaging,bottles', '包装,纸箱,塑料包装,可降解包装,快递包装'],
['151040', 'Metals & Mining', '金属与采矿', 'B', 'mining,lithium,copper,steel,aluminum,gold,iron ore,rare earth,nickel,cobalt,critical minerals', '矿业,锂矿,铜,钢铁,铝,黄金,稀土,镍,钴,有色金属'],
['151050', 'Paper & Forest Products', '纸类与林业产品', 'A', 'paper mill,pulp,forestry,timber,lumber,wood products', '造纸,纸浆,林业,木材'],
['201010', 'Aerospace & Defense', '航空航天与国防', 'C', 'aerospace,defense,satellite,rocket,drone,space launch,missile,military,evtol,aircraft', '航天,航空,国防,卫星,火箭,无人机,低空经济,军工,商业航天'],
['201020', 'Building Products', '建筑产品', 'C', 'hvac,windows doors,insulation,heat pump,roofing,building products,plumbing', '暖通,门窗,保温,热泵,卫浴,建筑产品'],
['201030', 'Construction & Engineering', '建筑与工程', 'E', 'construction,contractor,engineering firm,infrastructure project,construction tech,builder,epc', '建筑,施工,工程总包,基建,装配式,智能建造'],
['201040', 'Electrical Equipment', '电气设备', 'C', 'electrical equipment,battery,transformer,inverter,grid equipment,charger,ev charging,energy storage,electric motor', '电气设备,电池,储能,变压器,逆变器,充电桩,电机'],
['201050', 'Industrial Conglomerates', '工业集团', 'C', 'conglomerate,industrial group,siemens,honeywell,3m', '工业集团,多元化工业'],
['201060', 'Machinery', '机械', 'C', 'machinery,robot,robotics,industrial automation,cnc,excavator,humanoid,3d printing,factory automation,machine tool', '机械,机器人,人形机器人,工业自动化,数控,工程机械,机床,3D打印'],
['201070', 'Trading Companies & Distributors', '贸易公司与经销商', 'F', 'industrial distributor,wholesale,trading company,b2b marketplace,procurement', '贸易,批发,经销商,工业品采购,外贸'],
['202010', 'Commercial Services & Supplies', '商业服务与用品', 'L', 'waste management,recycling,facility services,security services,office supplies,cleaning services,printing', '垃圾处理,回收,物业服务,安保,保洁,办公用品'],
['202020', 'Professional Services', '专业服务', 'L', 'consulting,staffing,hr,recruiting,payroll,legal services,accounting,compliance,research services,outsourcing', '咨询,人力资源,招聘,猎头,法律服务,会计,合规,外包,灵活用工'],
['203010', 'Air Freight & Logistics', '航空货运与物流', 'G', 'logistics,freight,shipping,parcel,courier,last-mile,warehouse,fulfillment,supply chain,3pl', '物流,货运,快递,仓储,供应链,最后一公里,跨境物流'],
['203020', 'Passenger Airlines', '客运航空', 'G', 'airline,airlines,flights,air travel,passenger aviation', '航空公司,航班,民航'],
['203030', 'Marine Transportation', '海运', 'G', 'maritime,shipping container,ocean freight,port congestion,vessel,tanker', '海运,航运,集装箱,港口,船舶'],
['203040', 'Ground Transportation', '陆路运输', 'G', 'trucking,railroad,rail,ride-hailing,autonomous trucking,fleet,bus,robotaxi', '公路运输,货车,铁路,网约车,车队,自动驾驶卡车,Robotaxi'],
['203050', 'Transportation Infrastructure', '交通基础设施', 'G', 'airport,toll road,port operator,highway infrastructure', '机场,高速公路,港口运营,交通基础设施'],
['251010', 'Automobile Components', '汽车零部件', 'C', 'auto parts,lidar,automotive supplier,tire,adas,autonomous driving,ev battery pack', '汽车零部件,激光雷达,轮胎,智能驾驶,汽车电子'],
['251020', 'Automobiles', '汽车', 'C', 'electric vehicle,ev,tesla,automaker,car,byd,vehicle sales,hybrid,motorcycle', '汽车,新能源车,电动车,车企,比亚迪,蔚来,小鹏,理想'],
['252010', 'Household Durables', '家庭耐用消费品', 'C', 'home appliance,furniture,smart home,homebuilder,kitchen appliance,consumer electronics home', '家电,家具,智能家居,厨电,扫地机器人'],
['252020', 'Leisure Products', '休闲设备与用品', 'C', 'toys,sporting goods,fitness equipment,bicycles,outdoor gear,golf,camping', '玩具,潮玩,运动器材,健身器材,自行车,户外装备,露营'],
['252030', 'Textiles, Apparel & Luxury Goods', '纺织品、服装与奢侈品', 'C', 'apparel,fashion,luxury,footwear,clothing brand,sneakers,textile', '服装,时尚,奢侈品,鞋,纺织,国潮'],
['253010', 'Hotels, Restaurants & Leisure', '酒店、餐馆与休闲', 'H', 'restaurant,hotel,travel,tourism,casino,cruise,food service,coffee chain,theme park', '餐饮,酒店,旅游,文旅,咖啡,茶饮,景区,预制菜'],
['253020', 'Diversified Consumer Services', '综合消费者服务', 'P', 'education,edtech,tutoring,childcare,wedding,funeral,home services,pet services,online course', '教育,在线教育,培训,托育,家政,宠物服务,婚庆,职业教育'],
['255010', 'Distributors', '经销商', 'F', 'distributor,distribution,wholesale consumer goods', '分销,经销,渠道'],
['255030', 'Broadline Retail', '综合零售', 'F', 'e-commerce,ecommerce,marketplace,amazon,shopify,online retail,temu,shein,department store', '电商,网购,跨境电商,拼多多,淘宝,京东,直播带货'],
['255040', 'Specialty Retail', '专营零售', 'F', 'retail store,retailer,apparel retail,home improvement,auto dealer,specialty retail,resale,secondhand', '零售,门店,专卖店,二手,奥特莱斯'],
['301010', 'Consumer Staples Distribution & Retail', '日常消费品经销与零售', 'F', 'grocery,supermarket,convenience store,drugstore,food delivery,instant delivery,walmart,costco', '超市,便利店,生鲜,即时零售,社区团购,药店'],
['302010', 'Beverages', '饮料', 'C', 'beverage,drinks,beer,wine,spirits,soft drink,energy drink,coffee beverage', '饮料,啤酒,白酒,葡萄酒,酒类,茶饮料'],
['302020', 'Food Products', '食品', 'A', 'food,agriculture,farming,agtech,crop,meat,dairy,alternative protein,food tech,livestock,fishery', '食品,农业,种植,养殖,农产品,乳制品,肉类,智慧农业,渔业'],
['302030', 'Tobacco', '烟草', 'C', 'tobacco,cigarette,vaping,e-cigarette,nicotine', '烟草,香烟,电子烟'],
['303010', 'Household Products', '家庭用品', 'C', 'household products,detergent,cleaning products,diapers,paper towels', '日化,洗涤剂,清洁用品,纸尿裤'],
['303020', 'Personal Care Products', '个人护理用品', 'C', 'beauty,cosmetics,skincare,personal care,haircare,fragrance', '美妆,化妆品,护肤,个护,香水,医美'],
['351010', 'Health Care Equipment & Supplies', '医疗保健设备与用品', 'C', 'medical device,510(k),diagnostics device,surgical robot,wearable health,implant,imaging,medtech,fda clearance', '医疗器械,医疗设备,手术机器人,可穿戴,影像,体外诊断,耗材'],
['351020', 'Health Care Providers & Services', '医疗保健提供商与服务', 'Q', 'hospital,clinic,telehealth,health insurance,home care,nursing,elder care,pharmacy benefit,medicaid', '医院,诊所,互联网医疗,养老,护理,陪诊,医保,康复'],
['351030', 'Health Care Technology', '医疗保健技术', 'I', 'health tech,ehr,electronic health record,healthcare ai,digital health,medical ai,clinical software', '医疗信息化,数字医疗,医疗AI,电子病历,智慧医院'],
['352010', 'Biotechnology', '生物科技', 'M', 'biotech,gene therapy,crispr,cell therapy,mrna,antibody,clinical trial,oncology,rare disease', '生物科技,基因治疗,细胞治疗,创新药,抗体,临床试验,合成生物'],
['352020', 'Pharmaceuticals', '制药', 'C', 'pharma,pharmaceutical,drug approval,glp-1,generic drug,fda approval,recall drug,vaccine', '制药,药品,仿制药,疫苗,GLP-1,减肥药,集采,中药'],
['352030', 'Life Sciences Tools & Services', '生命科学工具与服务', 'M', 'life sciences,lab automation,sequencing,cro,cdmo,research tools,proteomics,genomics', '生命科学,测序,CRO,CDMO,实验室自动化,科研试剂'],
['401010', 'Banks', '银行', 'J', 'bank,banking,deposits,lender,community bank,neobank,loan', '银行,存款,贷款,数字银行'],
['402010', 'Financial Services', '金融服务', 'J', 'payments,fintech,stablecoin,crypto,payment processing,remittance,embedded finance,bnpl,wallet', '支付,金融科技,稳定币,加密货币,跨境支付,数字钱包'],
['402020', 'Consumer Finance', '消费金融', 'J', 'consumer lending,credit card,personal loan,buy now pay later,credit score', '消费金融,信用卡,消费贷,小额贷款,征信'],
['402030', 'Capital Markets', '资本市场', 'J', 'asset management,private equity,venture capital,stock exchange,brokerage,trading platform,ipo,hedge fund,etf', '资本市场,资产管理,私募,风投,券商,IPO,基金,量化'],
['402040', 'Mortgage REITs', '抵押房地产投资信托', 'J', 'mortgage reit,mortgage,mortgage rates,home loans', '房贷,按揭,抵押贷款'],
['403010', 'Insurance', '保险', 'J', 'insurance,insurer,insurtech,underwriting,reinsurance,claims,life insurance,auto insurance', '保险,保险科技,理赔,车险,寿险,健康险,再保险'],
['451020', 'IT Services', 'IT 服务', 'I', 'it services,cloud services,consulting it,managed services,data center services,outsourcing it,digital transformation', 'IT服务,云服务,数字化转型,系统集成,外包开发,数据中心'],
['451030', 'Software', '软件', 'I', 'software,saas,developer tools,ai agent,llm,open source,api,devops,cybersecurity,database,no-code,ai model,machine learning', '软件,SaaS,开发者工具,大模型,智能体,开源,网络安全,数据库,低代码,AI应用'],
['452010', 'Communications Equipment', '通信设备', 'C', 'networking equipment,router,5g equipment,optical module,antenna,wifi,satellite internet', '通信设备,路由器,光模块,5G基站,天线,卫星互联网'],
['452020', 'Technology Hardware, Storage & Peripherals', '科技硬件、存储与外设', 'C', 'smartphone,laptop,pc,hardware,storage,iphone,wearable,ar glasses,vr headset,keyboard', '手机,电脑,硬件,存储,智能穿戴,AR眼镜,VR,消费电子'],
['452030', 'Electronic Equipment, Instruments & Components', '电子设备、仪器与元件', 'C', 'sensor,display,pcb,electronic components,instruments,oled,connector,lidar sensor', '传感器,显示屏,PCB,电子元器件,仪器仪表,面板'],
['453010', 'Semiconductors & Semiconductor Equipment', '半导体与半导体设备', 'C', 'semiconductor,chip,gpu,foundry,tsmc,nvidia,asml,wafer,lithography,ai chip,memory chip,hbm', '半导体,芯片,晶圆,光刻机,GPU,算力,存储芯片,国产替代'],
['501010', 'Diversified Telecommunication Services', '综合电信服务', 'I', 'telecom,broadband,fiber,isp,carrier,telecommunications', '电信,宽带,光纤,运营商'],
['501020', 'Wireless Telecommunication Services', '无线电信服务', 'I', 'wireless carrier,mobile network,5g network,esim,spectrum,mvno', '移动通信,5G网络,eSIM,频谱'],
['502010', 'Media', '媒体', 'R', 'media,advertising,publishing,newspaper,broadcasting,adtech,marketing agency,podcast', '媒体,广告,出版,营销,自媒体,广告技术'],
['502020', 'Entertainment', '娱乐', 'R', 'gaming,video game,streaming,music,film,movie,esports,netflix,anime,concert', '游戏,影视,流媒体,音乐,电竞,动漫,短剧,演出'],
['502030', 'Interactive Media & Services', '互动媒体与服务', 'I', 'social media,search engine,creator economy,short video,dating app,community platform,tiktok,youtube', '社交媒体,搜索引擎,短视频,创作者经济,社区,直播,小红书,抖音'],
['551010', 'Electric Utilities', '电力公用事业', 'D', 'electric utility,power grid,electricity prices,transmission,utility rates,grid interconnection', '电网,电力,电价,输电,配电'],
['551020', 'Gas Utilities', '燃气公用事业', 'D', 'gas utility,natural gas distribution,gas pipeline utility', '燃气,城市燃气,管道燃气'],
['551030', 'Multi-Utilities', '综合公用事业', 'D', 'multi-utility,utility company', '综合公用事业,公用事业'],
['551040', 'Water Utilities', '水务', 'D', 'water utility,water treatment,wastewater,desalination,water infrastructure', '水务,污水处理,供水,海水淡化,水处理'],
['551050', 'Independent Power and Renewable Electricity Producers', '独立电力与可再生能源', 'D', 'solar,wind power,renewable energy,nuclear,geothermal,clean energy,power plant,smr,hydrogen', '光伏,风电,新能源,核电,氢能,绿电,可再生能源,储能电站'],
['601010', 'Diversified REITs', '多元化 REITs', 'K', 'diversified reit,reit', 'REITs,不动产投资信托'],
['601025', 'Industrial REITs', '工业 REITs', 'K', 'industrial reit,warehouse reit,logistics real estate', '物流地产,产业园,仓储地产'],
['601030', 'Hotel & Resort REITs', '酒店与度假村 REITs', 'K', 'hotel reit,resort reit', '酒店资产,度假村'],
['601040', 'Office REITs', '办公 REITs', 'K', 'office reit,office space,office vacancy,coworking', '写字楼,办公空间,联合办公,空置率'],
['601050', 'Health Care REITs', '医疗保健 REITs', 'K', 'senior housing,healthcare reit,medical office building', '养老地产,康养社区'],
['601060', 'Residential REITs', '住宅 REITs', 'K', 'apartment,rental housing,single-family rental,multifamily,rent prices', '长租公寓,租房,保障性住房,租金'],
['601070', 'Retail REITs', '零售 REITs', 'K', 'shopping mall,retail reit,shopping center', '购物中心,商场,商业地产'],
['601080', 'Specialized REITs', '特种 REITs', 'K', 'data center reit,cell tower,self storage,timberland reit', '数据中心,通信塔,自助仓储'],
['602010', 'Real Estate Management & Development', '房地产管理与开发', 'K', 'real estate,property,proptech,homebuilding,housing market,property developer,home sales', '房地产,楼市,房企,物业管理,房产中介,城市更新']
];
const INDUSTRIES = L.map(([code, en, cn, gb, ek, ck]) => ({ code, sector: code.slice(0, 2), sectorEn: SECTORS[code.slice(0, 2)][0], sectorCn: SECTORS[code.slice(0, 2)][1], en, cn, gb, gbName: GB[gb], kwEn: ek.split(','), kwCn: ck.split(',') }));
// 关键词打标（返回 [code, score]），向量打标在 engine 中叠加
function tagByKeywords(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5+.()-]+/g, ' ') + ' ';
  let best = null, bs = 0;
  for (const ind of INDUSTRIES) { let s = 0;
    for (const k of ind.kwEn) if (t.includes(' ' + k + ' ') || (k.length > 6 && t.includes(k))) s += k.includes(' ') ? 2 : 1;
    for (const k of ind.kwCn) if (t.includes(k.toLowerCase())) s += 1.5;
    if (s > bs) { bs = s; best = ind.code; } }
  return bs >= 1 ? [best, bs] : [null, 0];
}
module.exports = { INDUSTRIES, SECTORS, GB, tagByKeywords };
