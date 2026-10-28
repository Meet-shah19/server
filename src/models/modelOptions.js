export const jsonOptions = {
  transform(_document, value) {
    value.id = String(value._id);
    delete value._id;
    delete value.__v;
    delete value.password;
    return value;
  },
};
