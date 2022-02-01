import { MulterError } from "multer";
import config from "../config/main.js";
import { AuthenticationError, UploadError } from "../config/errors.js";

export function handleServerErrors(error, req, res, next) {
  let { message, name } = error;
  let status = 500;
  let errors = [];
  let value = "";
  let type = "";
  let responseMessage = error.responseMessage || true;

  if (error instanceof AuthenticationError) {
    errors = [{ type: error.type, message, value: error.value }];
    status = error.status;
  } else if (error instanceof UploadError) {
    errors = [
      { type: error.type, message, field: error.field, value: error.value },
    ];
    status = error.status;
    responseMessage = message;
  } else if (error instanceof MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        value = error.field;
        message = error.message;
        responseMessage = "At least one uploaded file is too large";
        status = 413;
        break;
      default:
        console.log(error);
    }
    errors = [{ message, value }];
  } else {
    switch (name) {
      case "ValidationError":
        errors = Object.keys(error.errors).reduce((acc, field) => {
          acc.push({
            message: error.errors[field].message,
            value: error.errors[field].path,
            type: error.errors[field].kind,
          });
          return acc;
        }, []);
        break;
      case "MongoServerError":
        switch (error.code) {
          case 2:
            type = error.codeName;
            value = "none";
            message = `Bad value in query`;
            status = 500;
            break;
          case 11000:
            type = error.message;
            value = Object.keys(error.keyValue)[0];
            message = `'${value}' already exists`;
            status = 400;
            break;
          default:
            status = 500;
        }
        errors = [{ type, message, value }];
        break;
      default:
        throw error;
    }
  }

  const response = {
    name,
    message: responseMessage,
    errors,
  };
  if (config.env.mode === "development") console.error(error, response);
  return res.status(status).json(response);
}
