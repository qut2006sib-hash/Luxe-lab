process.env.NODE_ENV = "development";
void import("./_core/index").catch(error => {
  console.error(error);
  process.exitCode = 1;
});
