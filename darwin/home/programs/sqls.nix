{...}: {
  programs.sqls = {
    enable = true;
    settings = {
      lowercaseKeywords = false;
      connections = [
        {
          driver = "mysql";
          dataSourceName = "root:root@tcp(127.0.0.1:3306)/world";
        }
      ];
    };
  };
}
