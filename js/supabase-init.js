(function(){
  const ZL=window.ZL=window.ZL||{};
  const CONFIG_KEY="zaklifeSupabaseConfig";
  let cachedClient=null;
  let cachedKey="";

  function readConfig(){
    let local={};
    try{
      local=JSON.parse(localStorage.getItem(CONFIG_KEY)||"{}");
    }catch(e){
      local={};
    }
    const inline=window.ZL_SUPABASE_CONFIG||{};
    const config={...inline,...local};
    return {
      url:String(config.url||"").trim(),
      anonKey:String(config.anonKey||config.publishableKey||"").trim()
    };
  }

  function saveConfig(config){
    const payload={
      url:String(config?.url||"").trim(),
      anonKey:String(config?.anonKey||config?.publishableKey||"").trim()
    };
    localStorage.setItem(CONFIG_KEY,JSON.stringify(payload));
    cachedClient=null;
    cachedKey="";
    return payload;
  }

  function clearConfig(){
    localStorage.removeItem(CONFIG_KEY);
    cachedClient=null;
    cachedKey="";
  }

  function hasConfig(){
    const config=readConfig();
    return Boolean(config.url&&config.anonKey);
  }

  function getClient(){
    const config=readConfig();
    if(!config.url||!config.anonKey)throw new Error("Supabase config is missing");
    if(!window.supabase||typeof window.supabase.createClient!=="function"){
      throw new Error("Supabase client library is not loaded");
    }
    const key=config.url+"|"+config.anonKey.slice(0,12);
    if(cachedClient&&cachedKey===key)return cachedClient;
    cachedClient=window.supabase.createClient(config.url,config.anonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
      realtime:{params:{eventsPerSecond:5}}
    });
    cachedKey=key;
    return cachedClient;
  }

  async function getUser(){
    if(!hasConfig())return null;
    const client=getClient();
    const result=await client.auth.getUser();
    if(result.error)return null;
    return result.data?.user||null;
  }

  ZL.supabase={
    readConfig,
    saveConfig,
    clearConfig,
    hasConfig,
    getClient,
    getUser
  };
})();
