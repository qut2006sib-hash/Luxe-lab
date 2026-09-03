process.env.NODE_ENV = "development";
void import("./worker").catch(error => {
  console.error(error);
  process.exitCode = 1;
});
