// Shows temperature and humidity from a DHT11 on an I2C LCD.

void setup() {
  stfkartBegin();  // starts the sensor and the display
  lcd.print("Weather station");
  delay(1000);
}

void loop() {
  float temperature = climate.readTemperature();
  float humidity = climate.readHumidity();

  lcd.clear();
  if (isnan(temperature) || isnan(humidity)) {
    lcd.print("Sensor error");
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Temp: ");
    lcd.print(temperature, 1);
    lcd.print(" C");
    lcd.setCursor(0, 1);
    lcd.print("Humidity: ");
    lcd.print(humidity, 0);
    lcd.print(" %");
  }
  delay(2000);  // the DHT11 can only be read every 1-2 seconds
}
